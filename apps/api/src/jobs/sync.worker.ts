import { Worker } from 'bullmq';
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

import type { SyncJobData, SyncJobResult } from './sync.queue';
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

export function startSyncWorker() {
  const worker = new Worker<SyncJobData, SyncJobResult>(
    'sync',
    async (job) => {
      const { userId, platformAccountId, platform } = job.data;

      // Lock por usuario — garantiza que solo un sync del mismo userId corra a la vez.
      // Usuarios distintos siguen en paralelo (la concurrency global del worker no cambia).
      // TTL de 10 min como failsafe si el proceso muere sin liberar el lock.
      const lockKey = `sync:user-lock:${userId}`;
      const LOCK_TTL_SECONDS = 600;
      const acquired = await redis.set(lockKey, job.id ?? 'locked', 'EX', LOCK_TTL_SECONDS, 'NX');

      if (!acquired) {
        // Otro sync de este usuario está activo — reencolar con delay y terminar este job.
        await syncQueue.add(
          job.name,
          job.data,
          { delay: 5000, priority: job.opts.priority },
        );
        logger.info({ userId, platform }, '[SyncWorker] Sync reencolado — usuario con sync activo');
        return { achievementsSynced: 0, gamesUpdated: 0, syncedAt: new Date().toISOString() };
      }

      try {
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
        syncProgressKey(userId, platform as Platform),
        7200,
        JSON.stringify({ isRunning: true, processed: 0, total: 0, percentComplete: 0, startedAt }),
      );

      const io = getIOSafe();

      const onBatch = async (progress: SyncBatchProgress): Promise<void> => {
        const percentComplete =
          progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
        await redis.setex(
          syncProgressKey(userId, platform as Platform),
          7200,
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

      let result: Awaited<ReturnType<typeof adapter.syncUser>>;
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
        }
        await redis.del(syncProgressKey(userId, platform as Platform));
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

      // Acumular XP de los nuevos logros y actualizar BD + rankings Redis
      if (xpEarned > 0) {
        await addXp(userId, xpEarned, 'ACHIEVEMENT');
      } else {
        // Sin nuevos logros — garantizar que el usuario sigue en todos los sorted sets de plataforma.
        // Cubre usuarios que vincularon plataformas antes de que linkPlatform llamara a upsertUserScore
        // y que ya no generan XP nuevo en syncs posteriores.
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

      // Invalidar caché pública del usuario — sus juegos/logros acaban de actualizarse
      await invalidateUserPublicCache(userId).catch((err: unknown) => {
        logger.warn({ err: (err as Error).message }, '[SyncWorker] Error al invalidar caché pública');
      });

      await redis.del(syncProgressKey(userId, platform as Platform));
      if (io) {
        io.to(userRoom(userId)).emit('sync:complete', {
          platform,
          totalGames: result.gamesUpdated,
          newAchievements: result.achievementsSynced,
          xpEarned,
        });
      }

      return {
        achievementsSynced: result.achievementsSynced,
        gamesUpdated: result.gamesUpdated,
        syncedAt: result.syncedAt,
      };
      } finally {
        // Liberar el lock del usuario SIEMPRE — incluso si el sync falla.
        // Sin este finally, un crash dejaría al usuario bloqueado hasta que el TTL expire.
        await redis.del(lockKey);
        // Safety net: si el proceso murió antes de que el path normal o el catch borrara
        // la clave de progreso, la eliminamos aquí para no dejarla 2 horas en Redis.
        await redis.del(syncProgressKey(userId, platform as Platform)).catch(() => undefined);
      }
    },
    {
      connection: createWorkerConnection(),
      concurrency: 5,
      // 300 juegos PSN / 10 por lote = 30 lotes; cada lote incluye llamadas API → fácilmente > 30s.
      // lockDuration por defecto = 30s → job marcado como stalled antes de terminar.
      // 5 min es suficiente para el peor caso; stalledInterval en 30s para detección rápida.
      lockDuration: 300_000,
      stalledInterval: 30_000,
    },
  );

  worker.on('completed', (job) => {
    logger.info({ platform: job.data.platform, userId: job.data.userId }, 'Sync completado');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      {
        platform: job?.data.platform,
        userId: job?.data.userId,
        err: err.message,
        details: err instanceof AppError ? err.details : undefined,
      },
      'Sync fallido',
    );
  });

  return worker;
}
