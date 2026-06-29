import { SYNC_COOLDOWNS } from '@unlockhub/types';
import type { Platform } from '@unlockhub/types';

import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { syncQueue } from '../jobs/sync.queue';
import { AppError } from '../middleware/errorHandler';
import { FEATURES } from '../config/features';
import { STEAM_DAILY_LIMIT, STEAM_MANUAL_SYNC_THRESHOLD } from '../config/steamQuota';
import { steamAdapter } from '../platforms/steam.adapter';
import { retroAchievementsAdapter } from '../platforms/retroachievements.adapter';
import { psnAdapter } from '../platforms/psn.adapter';
import { xboxAdapter } from '../platforms/xbox.adapter';
import { logger } from '../lib/logger';
import type { PlatformAdapter } from '../platforms/platform.interface';

const ADAPTERS: Record<string, PlatformAdapter> = {
  STEAM: steamAdapter,
  RA: retroAchievementsAdapter,
  PSN: psnAdapter,
  XBOX: xboxAdapter,
};

const ALL_PLATFORMS: Platform[] = ['STEAM', 'RA', 'PSN', 'XBOX'];

/** Clave Redis del cooldown de sync manual por usuario y plataforma. */
function cooldownKey(userId: string, platform: Platform) {
  return `sync:cooldown:${userId}:${platform}`;
}

/** Clave Redis del contador diario de syncs manuales por usuario, plataforma y día. */
function dailyCountKey(userId: string, platform: Platform) {
  const date = new Date().toISOString().slice(0, 10);
  return `sync:daily:${userId}:${platform}:${date}`;
}

/** Clave Redis del progreso del sync activo (TTL 2h, fallback para clientes sin Socket.io). */
function syncProgressKey(userId: string, platform: Platform) {
  return `sync:progress:${userId}:${platform}`;
}

/**
 * Inicia un sync manual para una plataforma, respetando cooldowns y límites diarios.
 * Comprueba primero si ya hay un sync activo para el usuario (lock Redis) — si existe,
 * devuelve {status:'in_progress'} sin encolar ni consumir cooldown ni cuota diaria.
 * @throws {AppError} SYNC_COOLDOWN (429) si el cooldown no ha expirado.
 * @throws {AppError} DAILY_SYNC_LIMIT_EXCEEDED (429) si el usuario free alcanzó el límite diario.
 * @throws {AppError} PLATFORM_NOT_LINKED (404) si el usuario no tiene esa plataforma vinculada.
 */
export async function triggerManualSync(
  userId: string,
  platform: Platform,
  isPremium: boolean,
) {
  // Comprobar si ya hay un sync activo para este usuario antes de consumir cooldown/cuota.
  // El lock key es el mismo que usa el worker y triggerExpressSync.
  const lockKey = `sync:user-lock:${userId}`;
  const activeLock = await redis.get(lockKey);
  if (activeLock) {
    return { status: 'in_progress' as const, platform };
  }

  // Mientras premium esté desactivado todos usan el tier free
  const effectivePremium = FEATURES.premium && isPremium;
  const config = SYNC_COOLDOWNS[effectivePremium ? 'premium' : 'free'];
  const cooldownSeconds = config.manualSyncCooldownMinutes * 60;

  // Intentar adquirir el cooldown atómicamente con SET NX para evitar race conditions
  const acquired = await redis.set(cooldownKey(userId, platform), '1', 'EX', cooldownSeconds, 'NX');
  if (!acquired) {
    const ttl = await redis.ttl(cooldownKey(userId, platform));
    throw new AppError(
      `Sync en cooldown. Espera ${ttl > 0 ? ttl : cooldownSeconds} segundos.`,
      'SYNC_COOLDOWN',
      429,
      { remainingSeconds: ttl > 0 ? ttl : cooldownSeconds },
    );
  }

  // Cuota Steam: si el contador diario de la API de Steam supera el 90 % del límite,
  // omitir el trabajo de Steam para preservar cuota para syncs automáticos y otros usuarios.
  // Solo se aplica a STEAM — la cuota es por plataforma.
  if (platform === 'STEAM') {
    const today = new Date().toISOString().slice(0, 10);
    const steamCalls = parseInt((await redis.get(`steam:api:calls:${today}`)) ?? '0', 10);

    if (steamCalls >= STEAM_DAILY_LIMIT * STEAM_MANUAL_SYNC_THRESHOLD) {
      // Liberar cooldown para no penalizar al usuario: el rechazo es de infraestructura, no suyo.
      await redis.del(cooldownKey(userId, platform));

      const otherPlatformsCount = await prisma.platformAccount.count({
        where: { userId, platform: { not: 'STEAM' } },
      });

      if (otherPlatformsCount === 0) {
        throw new AppError(
          'Cuota de Steam API agotada por hoy. Inténtalo mañana.',
          'STEAM_QUOTA_EXCEEDED',
          429,
        );
      }

      // Múltiples plataformas: omitir Steam silenciosamente; el resto se encola normalmente.
      return {
        jobId: undefined,
        platform,
        message: 'Steam omitido: cuota de API al 90 %. El resto de tus plataformas se sincronizarán normalmente.',
        skippedByQuota: true as const,
      };
    }
  }

  // Comprobar límite diario de syncs manuales (solo tier free) — INCR atómico
  if (!effectivePremium && config.dailyManualSyncLimit !== null) {
    const countKey = dailyCountKey(userId, platform);
    const newCount = await redis.incr(countKey);
    if (newCount === 1) {
      // Primera petición del día: fijar TTL hasta medianoche
      await redis.expire(countKey, getSecondsUntilMidnight());
    }
    if (newCount > config.dailyManualSyncLimit) {
      await redis.decr(countKey);
      // Liberar el cooldown si el límite diario bloquea la petición
      await redis.del(cooldownKey(userId, platform));
      throw new AppError(
        `Límite diario de ${config.dailyManualSyncLimit} syncs manuales alcanzado.`,
        'DAILY_SYNC_LIMIT_EXCEEDED',
        429,
      );
    }
  }

  // Verificar que la plataforma solicitada está vinculada
  const requestedAccount = await prisma.platformAccount.findUnique({
    where: { userId_platform: { userId, platform } },
    select: { id: true },
  });
  if (!requestedAccount) {
    await redis.del(cooldownKey(userId, platform));
    throw new AppError(
      `No tienes vinculada una cuenta de ${platform}.`,
      'PLATFORM_NOT_LINKED',
      404,
    );
  }

  // Obtener TODAS las plataformas vinculadas para el job batch
  const allAccounts = await prisma.platformAccount.findMany({
    where: { userId },
    select: { id: true, platform: true },
  });

  // Converge en sync-bg:{userId} (jobId determinista) → deduplicación nativa BullMQ.
  // Si hay un batch en WAITING, el manual se absorbe en él (se sincroniza todo, no solo la plataforma pedida).
  const job = await syncQueue.add(
    `sync-bg:${userId}`,
    {
      userId,
      platforms: allAccounts.map((a) => ({ platform: a.platform as Platform, platformAccountId: a.id })),
      triggerType: 'manual',
    },
    { jobId: `sync-bg:${userId}`, removeOnComplete: { count: 20 }, removeOnFail: { count: 10 } },
  );

  return { jobId: job.id, platform, message: 'Sync iniciado correctamente.' };
}

/**
 * Devuelve el estado de sync de una plataforma concreta para un usuario.
 * Lee cooldown y progreso desde Redis; lastSyncedAt desde la BD.
 */
export async function getSyncStatus(userId: string, platform: Platform) {
  const account = await prisma.platformAccount.findUnique({
    where: { userId_platform: { userId, platform } },
    select: { lastSyncedAt: true, syncCooldownUntil: true },
  });

  const ttl = await redis.ttl(cooldownKey(userId, platform));
  const dailyCount = parseInt(
    (await redis.get(dailyCountKey(userId, platform))) ?? '0',
    10,
  );

  const progressRaw = await redis.get(syncProgressKey(userId, platform));
  let isRunning = false;
  let processed = 0;
  let total = 0;
  let percentComplete = 0;
  let startedAt: string | null = null;

  if (progressRaw) {
    try {
      const progress = JSON.parse(progressRaw) as {
        isRunning: boolean;
        processed: number;
        total: number;
        percentComplete: number;
        startedAt: string;
      };
      isRunning = progress.isRunning;
      processed = progress.processed;
      total = progress.total;
      percentComplete = progress.percentComplete;
      startedAt = progress.startedAt;
    } catch {
      // clave Redis corrupta — ignorar
    }
  }

  return {
    platform,
    lastSyncedAt: account?.lastSyncedAt ?? null,
    cooldownRemainingSeconds: ttl > 0 ? ttl : 0,
    dailySyncsUsed: dailyCount,
    linked: !!account,
    isRunning,
    processed,
    total,
    percentComplete,
    startedAt,
  };
}

/**
 * Devuelve el estado de sync de todas las plataformas vinculadas del usuario.
 * Filtra solo las plataformas que tienen una PlatformAccount en BD.
 */
export async function getActiveSyncStatus(userId: string) {
  const statuses = await Promise.all(
    ALL_PLATFORMS.map((platform) => getSyncStatus(userId, platform)),
  );
  return statuses.filter((s) => s.linked);
}

export interface AggregateSyncStatus {
  lastSyncAt: string | null;
  nextAutoSyncAt: string | null;
  cooldownRemainingSeconds: number;
  cooldownUntil: string | null;
  canSyncNow: boolean;
  manualSyncsUsedToday: number;
  dailySyncsLimit: number | null;
  anyPlatformLinked: boolean;
}

// Devuelve un resumen agregado del estado de sync para mostrar en la UI de la Biblioteca
export async function getAggregateSyncStatus(
  userId: string,
  isPremium: boolean,
): Promise<AggregateSyncStatus> {
  const effectivePremium = FEATURES.premium && isPremium;
  const config = SYNC_COOLDOWNS[effectivePremium ? 'premium' : 'free'];

  const linkedAccounts = await prisma.platformAccount.findMany({
    where: { userId },
    select: { platform: true, lastSyncedAt: true },
  });

  if (linkedAccounts.length === 0) {
    return {
      lastSyncAt: null,
      nextAutoSyncAt: null,
      cooldownRemainingSeconds: 0,
      cooldownUntil: null,
      canSyncNow: false,
      manualSyncsUsedToday: 0,
      dailySyncsLimit: config.dailyManualSyncLimit,
      anyPlatformLinked: false,
    };
  }

  // Leer cooldown y contador diario de cada plataforma vinculada en paralelo
  const perPlatform = await Promise.all(
    linkedAccounts.map(async (acc) => {
      const platform = acc.platform as Platform;
      const [ttl, dailyRaw] = await Promise.all([
        redis.ttl(cooldownKey(userId, platform)),
        redis.get(dailyCountKey(userId, platform)),
      ]);
      return {
        lastSyncedAt: acc.lastSyncedAt,
        cooldownRemainingSeconds: ttl > 0 ? ttl : 0,
        dailySyncsUsed: parseInt(dailyRaw ?? '0', 10),
      };
    }),
  );

  // Último sync global = el más reciente entre todas las plataformas
  const lastSyncDate = perPlatform
    .map((p) => p.lastSyncedAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const lastSyncAt = lastSyncDate?.toISOString() ?? null;
  const nextAutoSyncAt = lastSyncAt
    ? new Date(lastSyncDate!.getTime() + config.autoSyncIntervalMinutes * 60 * 1000).toISOString()
    : null;

  // Cooldown mínimo = tiempo hasta que la PRIMERA plataforma esté disponible
  const minCooldown = Math.min(...perPlatform.map((p) => p.cooldownRemainingSeconds));

  // canSyncNow = al menos una plataforma sin cooldown y sin límite diario agotado
  const canSyncNow = perPlatform.some((p) => {
    const limitOk =
      config.dailyManualSyncLimit === null || p.dailySyncsUsed < config.dailyManualSyncLimit;
    return p.cooldownRemainingSeconds === 0 && limitOk;
  });

  const cooldownUntil =
    minCooldown > 0 ? new Date(Date.now() + minCooldown * 1000).toISOString() : null;

  // Syncs usados hoy = el máximo entre plataformas (representativo de cuántos "sync all" hizo el usuario)
  const manualSyncsUsedToday = Math.max(...perPlatform.map((p) => p.dailySyncsUsed));

  return {
    lastSyncAt,
    nextAutoSyncAt,
    cooldownRemainingSeconds: minCooldown,
    cooldownUntil,
    canSyncNow,
    manualSyncsUsedToday,
    dailySyncsLimit: config.dailyManualSyncLimit,
    anyPlatformLinked: true,
  };
}

/**
 * Sync express: obtiene los N juegos/trofeos más recientes de forma síncrona (~30 s max).
 * Se llama al vincular una plataforma por primera vez para poblar la biblioteca antes
 * de responder al cliente. El full sync completo se encola en BullMQ aparte.
 *
 * Usa el mismo lock Redis que el BullMQ worker (sync:user-lock:{userId}) para evitar
 * que dos express syncs del mismo usuario corran en paralelo (ej: Steam + PSN vinculados
 * en rápida sucesión durante el onboarding) o que el express sync solape con un job
 * de BullMQ que ya arrancó para el mismo usuario.
 * Si el lock no está disponible, se omite el express sync y se encola un full sync
 * como fallback para que el trabajo no se pierda (A22).
 */
export async function triggerExpressSync(
  userId: string,
  platform: Platform,
): Promise<void> {
  const account = await prisma.platformAccount.findUnique({
    where: { userId_platform: { userId, platform } },
  });
  if (!account) return;

  const adapter = ADAPTERS[platform as keyof typeof ADAPTERS];
  if (!adapter?.syncUserExpress) return;

  const lockKey = `sync:user-lock:${userId}`;
  // TTL de 120s: margen holgado sobre los 25s del Promise.race del controller,
  // pero muy inferior al TTL de 600s del worker BullMQ (full sync).
  const acquired = await redis.set(lockKey, 'express', 'EX', 120, 'NX');

  if (!acquired) {
    logger.info({ userId, platform }, '[SyncService] Express sync omitido — sync activo para este usuario; encolando full sync como fallback');
    // Encolar el full sync para que el trabajo no se pierda (UX: usuario que vincula
    // dos plataformas en <25s vería la segunda sin logros hasta el sync nocturno).
    await queueInitialSync(userId, platform);
    return;
  }

  try {
    await adapter.syncUserExpress(account);
    await prisma.platformAccount.upsert({
      where: { userId_platform: { userId: account.userId, platform: account.platform } },
      update: { lastSyncedAt: new Date() },
      create: {
        userId: account.userId,
        platform: account.platform,
        externalId: account.externalId,
        username: account.username,
        encryptedToken: account.encryptedToken,
        lastSyncedAt: new Date(),
      },
    });
    logger.info({ userId, platform }, '[SyncService] Express sync completado');
  } catch (err) {
    logger.warn({ userId, platform, err: (err as Error).message }, '[SyncService] Express sync fallido — continuando');
  } finally {
    await redis.del(lockKey);
  }
}

/**
 * Encola el sync completo (batched) en BullMQ para procesamiento en background.
 * Se llama justo después de triggerExpressSync al vincular una plataforma.
 * @returns jobId de BullMQ, o undefined si no existe la PlatformAccount.
 */
export async function queueInitialSync(
  userId: string,
  platform: Platform,
): Promise<string | undefined> {
  const account = await prisma.platformAccount.findUnique({
    where: { userId_platform: { userId, platform } },
  });
  if (!account) return undefined;

  const job = await syncQueue.add(
    `initial-sync:${userId}:${platform}`,
    { userId, platformAccountId: account.id, platform, triggerType: 'initial' },
    { priority: 10 },
  );
  return job.id;
}

/**
 * Sync silencioso disparado al abrir la app (app-open trigger).
 * Usa un cooldown Redis por tier para respetar el intervalo de auto-sync:
 *   - free:    3600 s (60 min)
 *   - premium:  900 s (15 min)
 * El TTL es el propio intervalo del plan — no un valor fijo de 24h.
 * Si el cooldown está activo, devuelve {queued: false} sin coste alguno.
 */
export async function triggerAppOpenSync(
  userId: string,
  isPremium: boolean,
): Promise<{ queued: boolean }> {
  const effectivePremium = FEATURES.premium && isPremium;
  const ttlSeconds =
    SYNC_COOLDOWNS[effectivePremium ? 'premium' : 'free'].autoSyncIntervalMinutes * 60;

  const appOpenKey = `sync:appopen:${userId}`;
  const acquired = await redis.set(appOpenKey, '1', 'EX', ttlSeconds, 'NX');

  if (!acquired) {
    return { queued: false };
  }

  // Obtener todas las plataformas vinculadas y encolar el batch
  const accounts = await prisma.platformAccount.findMany({
    where: { userId },
    select: { id: true, platform: true },
  });

  if (accounts.length === 0) {
    return { queued: false };
  }

  await syncQueue.add(
    `sync-bg:${userId}`,
    {
      userId,
      platforms: accounts.map((a) => ({ platform: a.platform as Platform, platformAccountId: a.id })),
      triggerType: 'auto',
    },
    { jobId: `sync-bg:${userId}`, removeOnComplete: { count: 20 }, removeOnFail: { count: 10 } },
  );

  return { queued: true };
}

function getSecondsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  return Math.max(1, Math.floor((midnight.getTime() - now.getTime()) / 1000));
}
