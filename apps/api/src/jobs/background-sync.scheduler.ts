import { Queue } from 'bullmq';

import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { STEAM_DAILY_LIMIT, STEAM_BACKGROUND_SYNC_THRESHOLD } from '../config/steamQuota';

import { syncQueue } from './sync.queue';

const backgroundSyncQueue = new Queue('background-sync', { connection: redis });

// Lanza syncs automáticos para todos los usuarios que hayan tenido actividad
// en las últimas 24 horas. Se ejecuta una vez al día desde el scheduler.
// Si el uso de la Steam API supera el 80% del límite diario, se omite el batch
// para evitar alcanzar el techo y dejar sin sync a usuarios que abren la app.
export async function runBackgroundSyncs(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const steamApiKey = `steam:api:calls:${today}`;
  const steamCalls = parseInt((await redis.get(steamApiKey)) ?? '0', 10);

  if (steamCalls >= STEAM_DAILY_LIMIT * STEAM_BACKGROUND_SYNC_THRESHOLD) {
    logger.warn(
      { usagePct: Math.round((steamCalls / STEAM_DAILY_LIMIT) * 100) },
      '[BackgroundSync] Steam API por encima del umbral — batch omitido para preservar cuota',
    );
    return;
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const accounts = await prisma.platformAccount.findMany({
    where: {
      user: { lastSyncAt: { lte: oneDayAgo } },
    },
    select: {
      id: true,
      userId: true,
      platform: true,
    },
  });

  if (accounts.length === 0) {
    logger.info('[BackgroundSync] Sin usuarios activos en las últimas 24h');
    return;
  }

  for (const account of accounts) {
    await syncQueue.add(
      `background-sync:${account.userId}:${account.platform}`,
      {
        userId: account.userId,
        platformAccountId: account.id,
        platform: account.platform,
        triggerType: 'auto',
      },
      {
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 10 },
      },
    );
  }

  logger.info({ count: accounts.length }, '[BackgroundSync] Syncs encolados');
}

export async function scheduleBackgroundSyncJob(): Promise<void> {
  const repeatable = await backgroundSyncQueue.getRepeatableJobs();
  for (const job of repeatable) {
    await backgroundSyncQueue.removeRepeatableByKey(job.key);
  }

  // Ejecutar a las 03:00 UTC diariamente para evitar picos de tráfico
  await backgroundSyncQueue.add(
    'daily-background-sync',
    {},
    {
      repeat: { pattern: '0 3 * * *', tz: 'UTC' },
      jobId: 'daily-background-sync',
    },
  );

  logger.info('[BackgroundSyncScheduler] Job diario programado (0 3 * * * UTC)');
}
