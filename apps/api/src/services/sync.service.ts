import { SYNC_COOLDOWNS } from '@unlockhub/types';
import type { Platform } from '@unlockhub/types';

import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { syncQueue } from '../jobs/sync.queue';
import { AppError } from '../middleware/errorHandler';
import { FEATURES } from '../config/features';
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

function cooldownKey(userId: string, platform: Platform) {
  return `sync:cooldown:${userId}:${platform}`;
}

function dailyCountKey(userId: string, platform: Platform) {
  const date = new Date().toISOString().slice(0, 10);
  return `sync:daily:${userId}:${platform}:${date}`;
}

function syncProgressKey(userId: string, platform: Platform) {
  return `sync:progress:${userId}:${platform}`;
}

export async function triggerManualSync(
  userId: string,
  platform: Platform,
  isPremium: boolean,
) {
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

  const account = await prisma.platformAccount.findUnique({
    where: { userId_platform: { userId, platform } },
  });
  if (!account) {
    // Liberar el cooldown si la cuenta no existe para no penalizar al usuario
    await redis.del(cooldownKey(userId, platform));
    throw new AppError(
      `No tienes vinculada una cuenta de ${platform}.`,
      'PLATFORM_NOT_LINKED',
      404,
    );
  }

  const job = await syncQueue.add(
    `manual-sync:${userId}:${platform}`,
    { userId, platformAccountId: account.id, platform, triggerType: 'manual' },
  );

  return { jobId: job.id, platform, message: 'Sync iniciado correctamente.' };
}

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

  try {
    await adapter.syncUserExpress(account);
    await prisma.platformAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date() },
    });
    logger.info({ userId, platform }, '[SyncService] Express sync completado');
  } catch (err) {
    logger.warn({ userId, platform, err: (err as Error).message }, '[SyncService] Express sync fallido — continuando');
  }
}

/**
 * Encola el sync completo (batched) en BullMQ para procesamiento en background.
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

function getSecondsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  return Math.max(1, Math.floor((midnight.getTime() - now.getTime()) / 1000));
}
