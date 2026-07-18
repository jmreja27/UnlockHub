import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import * as Sentry from '@sentry/node';
import type { Platform } from '@unlockhub/types';

import { AppError } from '../middleware/errorHandler';
import { createWorkerConnection, redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { getIO } from '../lib/socket';
import type { PlatformAdapter, SyncBatchProgress } from '../platforms/platform.interface';
import { steamAdapter } from '../platforms/steam.adapter';
import { retroAchievementsAdapter } from '../platforms/retroachievements.adapter';
import { psnAdapter } from '../platforms/psn.adapter';
import { xboxAdapter } from '../platforms/xbox.adapter';
import { sendPush } from '../services/notification.service';
import { createNotification } from '../services/inapp-notification.service';
import { addXp, invalidateUserPublicCache } from '../services/user.service';
import { upsertUserScore } from '../services/ranking.service';

import type { AnySyncJobData, SyncBatchJobData, SyncJobData, SyncJobResult } from './sync.queue';
import { syncQueue } from './sync.queue';

const ADAPTERS: Record<string, PlatformAdapter> = {
  STEAM: steamAdapter,
  RA: retroAchievementsAdapter,
  PSN: psnAdapter,
  XBOX: xboxAdapter,
};

const PLATFORM_LABELS: Record<string, string> = {
  STEAM: 'Steam',
  RA: 'RetroAchievements',
  PSN: 'PlayStation',
  XBOX: 'Xbox',
};

/** Clave Redis para deduplicar la alerta Sentry de NPSSO expirado — evita repetirla en cada sync mientras el token siga caído. */
const NPSSO_ALERT_KEY = 'alert:npsso-expired';
/** TTL de la dedup de la alerta NPSSO — 6h: suficiente para no saturar Sentry sin retrasar demasiado el re-aviso. */
const NPSSO_ALERT_TTL_SECONDS = 6 * 60 * 60;

const LOCK_TTL_SECONDS = 600;
/** Delay entre reintentos cuando el lock está ocupado (job single-platform). */
const LOCK_RETRY_DELAY_MS = 30_000;
/** Número máximo de reintentos de adquisición de lock antes de abandonar el job. */
const LOCK_MAX_RETRIES = 3;
/** TTL de la clave sync:progress en Redis. Se renueva en cada callback onBatch (T102).
 *  15 min cubre el peor caso real por plataforma (PSN+Steam con tope A51 en serie). */
const SYNC_PROGRESS_TTL_SECONDS = 900;

function syncProgressKey(userId: string, platform: Platform): string {
  return `sync:progress:${userId}:${platform}`;
}

function userRoom(userId: string): string {
  return `user:${userId}`;
}

function getIOSafe() {
  try {
    return getIO();
  } catch {
    return null;
  }
}

function isBatchJob(data: AnySyncJobData): data is SyncBatchJobData {
  return 'platforms' in data;
}

/**
 * Sincroniza una única plataforma para un usuario.
 * Emite sync:progress y sync:complete/sync:error vía Socket.io.
 * Limpia la clave de progreso Redis en ambas rutas (éxito y error).
 * Relanza el error para que el caller pueda decidir si continúa (batch) o falla (single).
 */
async function syncPlatform(
  userId: string,
  platformAccountId: string,
  platform: Platform,
): Promise<{ achievementsSynced: number; gamesUpdated: number }> {
  const account = await prisma.platformAccount.findUnique({
    where: { id: platformAccountId },
  });
  if (!account) throw new Error(`PlatformAccount ${platformAccountId} no encontrada`);

  const adapter = ADAPTERS[platform as keyof typeof ADAPTERS];
  if (!adapter) throw new Error(`Plataforma ${platform} no soportada`);

  const prevEarnedIds = new Set(
    (
      await prisma.userAchievement.findMany({
        where: { userId },
        select: { achievementId: true },
      })
    ).map((a) => a.achievementId),
  );

  const startedAt = new Date().toISOString();
  await redis.setex(
    syncProgressKey(userId, platform),
    SYNC_PROGRESS_TTL_SECONDS,
    JSON.stringify({ isRunning: true, processed: 0, total: 0, percentComplete: 0, startedAt }),
  );

  const io = getIOSafe();
  logger.info({ userId, platform }, '[SyncWorker] Sync iniciado');

  const onBatch = async (progress: SyncBatchProgress): Promise<void> => {
    const percentComplete =
      progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
    await redis.setex(
      syncProgressKey(userId, platform),
      SYNC_PROGRESS_TTL_SECONDS,
      JSON.stringify({
        isRunning: true,
        processed: progress.processed,
        total: progress.total,
        percentComplete,
        startedAt,
      }),
    );
    if (io) {
      io.to(userRoom(userId)).emit('sync:progress', {
        platform,
        processed: progress.processed,
        total: progress.total,
        newGamesCount: progress.newGamesCount,
        newAchievementsCount: progress.newAchievementsCount,
        percentComplete,
      });
    }
  };

  // T104: finally garantiza que la clave sync:progress se borra en TODOS los caminos de salida
  // (éxito, error del adapter, error en código post-adapter, throw inesperado).
  try {
    let result: Awaited<ReturnType<typeof adapter.syncUser>>;
    const syncStartedAt = Date.now();
    try {
      if (adapter.syncUserBatched) {
        result = await adapter.syncUserBatched(account, onBatch);
      } else {
        result = await adapter.syncUser(account);
      }
    } catch (err) {
      if (err instanceof AppError && err.code === 'PSN_REFRESH_TOKEN_EXPIRED') {
        await prisma.platformAccount.upsert({
          where: { userId_platform: { userId: account.userId, platform: account.platform } },
          update: { requiresReauth: true },
          create: {
            userId: account.userId,
            platform: account.platform,
            externalId: account.externalId,
            username: account.username,
            encryptedToken: account.encryptedToken,
            requiresReauth: true,
          },
        });
        await createNotification({
          userId,
          type: 'PLATFORM_REAUTH_REQUIRED',
          title: 'Reconecta tu cuenta PSN',
          body: 'Tu sesión de PlayStation ha expirado. Vuelve a vincular tu cuenta para continuar sincronizando tus trofeos.',
        });
        logger.warn({ userId, platform }, '[SyncWorker] Refresh token PSN expirado — requiresReauth marcado');
      } else if (err instanceof AppError && err.code === 'PSN_PROFILE_PRIVATE') {
        await prisma.platformAccount.upsert({
          where: { userId_platform: { userId: account.userId, platform: account.platform } },
          update: { psnProfilePrivate: true },
          create: {
            userId: account.userId,
            platform: account.platform,
            externalId: account.externalId,
            username: account.username,
            encryptedToken: account.encryptedToken,
            psnProfilePrivate: true,
          },
        });
        logger.warn({ userId, platform }, '[SyncWorker] Perfil PSN privado — psnProfilePrivate marcado');
      } else if (err instanceof AppError && err.code === 'PSN_SYSTEM_NPSSO_EXPIRED') {
        const shouldAlert = await redis.set(
          NPSSO_ALERT_KEY,
          '1',
          'EX',
          NPSSO_ALERT_TTL_SECONDS,
          'NX',
        );
        if (shouldAlert) {
          Sentry.captureMessage('PSN_SYSTEM_NPSSO_EXPIRED: el NPSSO del sistema ha expirado', {
            level: 'error',
            tags: { alert: 'psn-npsso-expired' },
          });
        }
        logger.error(
          { userId, platform },
          '[SyncWorker] NPSSO del sistema expirado — alerta Sentry enviada (o ya activa por dedup)',
        );
      }
      if (io) {
        io.to(userRoom(userId)).emit('sync:error', {
          platform,
          error: err instanceof AppError ? err.code : 'SYNC_FAILED',
          processedBeforeError: 0,
        });
      }
      throw err;
    }

    await prisma.platformAccount.upsert({
      where: { userId_platform: { userId: account.userId, platform: account.platform } },
      update: { lastSyncedAt: new Date(), requiresReauth: false, psnProfilePrivate: false },
      create: {
        userId: account.userId,
        platform: account.platform,
        externalId: account.externalId,
        username: account.username,
        encryptedToken: account.encryptedToken,
        lastSyncedAt: new Date(),
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { lastSyncAt: new Date() },
    });

    const newAchievements = await prisma.userAchievement.findMany({
      where: {
        userId,
        achievementId: { notIn: [...prevEarnedIds] },
      },
      include: { achievement: { select: { title: true, normalizedPoints: true } } },
      orderBy: { unlockedAt: 'desc' },
    });

    const xpEarned = newAchievements.reduce((sum, ua) => sum + ua.achievement.normalizedPoints, 0);

    for (const ua of newAchievements.slice(0, 3)) {
      await sendPush(
        userId,
        '🏆 ¡Nuevo logro desbloqueado!',
        `${ua.achievement.title} · ${PLATFORM_LABELS[platform] ?? platform} · +${ua.achievement.normalizedPoints} XP`,
        { achievementId: ua.achievementId, platform },
      ).catch((err: unknown) => {
        logger.warn({ err: (err as Error).message }, '[SyncWorker] Push notification fallida');
      });
    }

    if (xpEarned > 0) {
      await addXp(userId, xpEarned, 'ACHIEVEMENT');
    } else {
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { xp: true, profileVisibility: true },
      });
      if (dbUser) {
        const platformsData = await prisma.platformAccount.findMany({
          where: { userId },
          select: { platform: true },
        });
        await upsertUserScore(
          userId,
          dbUser.xp,
          platformsData.map((p) => p.platform),
          dbUser.profileVisibility,
        );
      }
    }

    await invalidateUserPublicCache(userId).catch((err: unknown) => {
      logger.warn({ err: (err as Error).message }, '[SyncWorker] Error al invalidar caché pública');
    });

    if (io) {
      io.to(userRoom(userId)).emit('sync:complete', {
        platform,
        totalGames: result.gamesUpdated,
        newAchievements: result.achievementsSynced,
        xpEarned,
      });
    }

    logger.info(
      { userId, platform, gamesUpdated: result.gamesUpdated, achievementsSynced: result.achievementsSynced },
      '[SyncWorker] Sync completado',
    );

    // T114 — reparto de tiempo del sync completo (red vs escritura vs overhead no cubierto por la instrumentación).
    const totalSyncMs = Date.now() - syncStartedAt;
    const totalFetchMs = result.timing?.fetchMs ?? 0;
    const totalWriteMs = result.timing?.writeMs ?? 0;
    logger.info(
      {
        userId,
        platform,
        games: result.gamesUpdated,
        achievements: result.achievementsSynced,
        totalFetchMs,
        totalWriteMs,
        totalMs: totalSyncMs,
        overheadMs: totalSyncMs - totalFetchMs - totalWriteMs,
      },
      '[SyncWorker] Reparto de tiempo del sync',
    );

    return { achievementsSynced: result.achievementsSynced, gamesUpdated: result.gamesUpdated };
  } finally {
    await redis.del(syncProgressKey(userId, platform));
  }
}

export async function processSyncJob(
  job: Job<AnySyncJobData, SyncJobResult>,
): Promise<SyncJobResult> {
  const data = job.data;
  const { userId } = data;
  const lockKey = `sync:user-lock:${userId}`;

  if (isBatchJob(data)) {
    // ── Branch batch (background-sync): un lock, plataformas en serie ──────
    const acquired = await redis.set(lockKey, job.id ?? 'locked', 'EX', LOCK_TTL_SECONDS, 'NX');

    if (!acquired) {
      // Batch job con lock ocupado: abandonar — el scheduler nocturno reintentará mañana.
      // No se reencola para no acumular jobs batch huérfanos.
      logger.warn({ userId }, '[SyncWorker] Batch job omitido — usuario con sync activo');
      return { achievementsSynced: 0, gamesUpdated: 0, syncedAt: new Date().toISOString() };
    }

    let totalAchievements = 0;
    let totalGames = 0;

    try {
      for (const { platform, platformAccountId } of data.platforms) {
        // Extender el lock de BullMQ entre plataformas para evitar que un batch largo
        // (N plataformas en serie) supere el lockDuration y sea marcado como stalled.
        // El try/catch garantiza que un fallo de extendLock no interrumpa el batch.
        try {
          await job.extendLock(job.token!, LOCK_TTL_SECONDS * 1000);
        } catch (extendErr: unknown) {
          logger.warn(
            { err: (extendErr as Error).message },
            '[SyncWorker] extendLock fallido — continuando',
          );
        }

        try {
          const result = await syncPlatform(userId, platformAccountId, platform as Platform);
          totalAchievements += result.achievementsSynced;
          totalGames += result.gamesUpdated;
        } catch (platformErr: unknown) {
          // Fallo independiente por plataforma: log + continuar con la siguiente.
          // El job batch NO falla aunque una plataforma falle.
          logger.warn(
            { userId, platform, err: (platformErr as Error).message },
            '[SyncWorker] Error en plataforma del batch — continuando con la siguiente',
          );
        }
      }
    } finally {
      await redis.del(lockKey);
      // Safety net: limpiar claves de progreso huérfanas en caso de crash parcial
      for (const { platform } of data.platforms) {
        await redis.del(syncProgressKey(userId, platform as Platform)).catch(() => undefined);
      }
    }

    return {
      achievementsSynced: totalAchievements,
      gamesUpdated: totalGames,
      syncedAt: new Date().toISOString(),
    };
  } else {
    // ── Branch single-platform (manual, initial, auto-repeat) ────────────
    const { platformAccountId, platform, lockRetryCount = 0 } = data as SyncJobData;
    const acquired = await redis.set(lockKey, job.id ?? 'locked', 'EX', LOCK_TTL_SECONDS, 'NX');

    if (!acquired) {
      if (lockRetryCount >= LOCK_MAX_RETRIES) {
        // Techo de reintentos alcanzado: abandonar limpiamente sin más reencolados.
        logger.warn(
          { userId, platform, lockRetryCount },
          '[SyncWorker] Sync abandonado — lock no disponible tras máximo de reintentos',
        );
        return { achievementsSynced: 0, gamesUpdated: 0, syncedAt: new Date().toISOString() };
      }

      // Reencolar con delay y contador incrementado (controlado — no bucle infinito)
      await syncQueue.add(
        job.name,
        { ...(data as SyncJobData), lockRetryCount: lockRetryCount + 1 },
        { delay: LOCK_RETRY_DELAY_MS, priority: job.opts.priority },
      );
      logger.info(
        { userId, platform, attempt: lockRetryCount + 1, maxAttempts: LOCK_MAX_RETRIES },
        '[SyncWorker] Sync reencolado — lock ocupado',
      );
      return { achievementsSynced: 0, gamesUpdated: 0, syncedAt: new Date().toISOString() };
    }

    try {
      const result = await syncPlatform(userId, platformAccountId, platform);
      return {
        achievementsSynced: result.achievementsSynced,
        gamesUpdated: result.gamesUpdated,
        syncedAt: new Date().toISOString(),
      };
    } finally {
      await redis.del(lockKey);
      await redis.del(syncProgressKey(userId, platform)).catch(() => undefined);
    }
  }
}

export function startSyncWorker() {
  const worker = new Worker<AnySyncJobData, SyncJobResult>(
    'sync',
    processSyncJob,
    {
      connection: createWorkerConnection(),
      concurrency: 5,
      // 300 juegos PSN / 10 por lote × N plataformas en serie → puede superar 5 min.
      // BullMQ renueva el lock automáticamente cada lockDuration/2 ms internamente;
      // además extendLock se llama explícitamente entre plataformas en el branch batch.
      lockDuration: 300_000,
      stalledInterval: 30_000,
    },
  );

  worker.on('completed', (job) => {
    const platform = 'platform' in job.data ? job.data.platform : 'batch';
    logger.info({ platform, userId: job.data.userId }, 'Sync completado');
  });

  worker.on('failed', (job, err) => {
    const platform = job?.data && 'platform' in job.data ? job.data.platform : 'batch';
    logger.error(
      {
        platform,
        userId: job?.data.userId,
        err: err.message,
        details: err instanceof AppError ? err.details : undefined,
      },
      'Sync fallido',
    );
  });

  return worker;
}
