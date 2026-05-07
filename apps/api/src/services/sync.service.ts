import { SYNC_COOLDOWNS } from '@unlockhub/types';
import type { Platform } from '@unlockhub/types';

import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { syncQueue } from '../jobs/sync.queue';
import { AppError } from '../middleware/errorHandler';
import { FEATURES } from '../config/features';

function cooldownKey(userId: string, platform: Platform) {
  return `sync:cooldown:${userId}:${platform}`;
}

function dailyCountKey(userId: string, platform: Platform) {
  const date = new Date().toISOString().slice(0, 10);
  return `sync:daily:${userId}:${platform}:${date}`;
}

export async function triggerManualSync(
  userId: string,
  platform: Platform,
  isPremium: boolean,
) {
  // Mientras premium esté desactivado todos usan el tier free
  const effectivePremium = FEATURES.premium && isPremium;
  const config = SYNC_COOLDOWNS[effectivePremium ? 'premium' : 'free'];

  // Comprobar cooldown de Redis (más rápido que consultar la BD)
  const ttl = await redis.ttl(cooldownKey(userId, platform));
  if (ttl > 0) {
    throw new AppError(
      `Sync en cooldown. Espera ${ttl} segundos.`,
      'SYNC_COOLDOWN',
      429,
      { remainingSeconds: ttl },
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
    throw new AppError(
      `No tienes vinculada una cuenta de ${platform}.`,
      'PLATFORM_NOT_LINKED',
      404,
    );
  }

  // Establecer cooldown antes de encolar para evitar doble disparo
  const cooldownSeconds = config.manualSyncCooldownMinutes * 60;
  await redis.set(cooldownKey(userId, platform), '1', 'EX', cooldownSeconds);

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

  return {
    platform,
    lastSyncedAt: account?.lastSyncedAt ?? null,
    cooldownRemainingSeconds: ttl > 0 ? ttl : 0,
    dailySyncsUsed: dailyCount,
    linked: !!account,
  };
}

function getSecondsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  return Math.max(1, Math.floor((midnight.getTime() - now.getTime()) / 1000));
}
