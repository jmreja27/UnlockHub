import { SYNC_COOLDOWNS } from '@unlockhub/types';
import type { Platform } from '@unlockhub/types';

import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { syncQueue } from '../jobs/sync.queue';
import { AppError } from '../middleware/errorHandler';

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
  const config = SYNC_COOLDOWNS[isPremium ? 'premium' : 'free'];

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

  // Comprobar límite diario de syncs manuales (solo tier free)
  if (!isPremium && config.dailyManualSyncLimit !== null) {
    const countKey = dailyCountKey(userId, platform);
    const count = parseInt((await redis.get(countKey)) ?? '0', 10);
    if (count >= config.dailyManualSyncLimit) {
      throw new AppError(
        `Límite diario de ${config.dailyManualSyncLimit} syncs manuales alcanzado.`,
        'DAILY_SYNC_LIMIT_EXCEEDED',
        429,
      );
    }
    const secondsUntilMidnight = getSecondsUntilMidnight();
    await redis.set(countKey, count + 1, 'EX', secondsUntilMidnight);
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
  midnight.setHours(23, 59, 59, 999);
  return Math.floor((midnight.getTime() - now.getTime()) / 1000);
}
