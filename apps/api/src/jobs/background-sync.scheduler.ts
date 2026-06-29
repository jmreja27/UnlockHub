import { Queue, Worker } from 'bullmq';
import type { Platform } from '@unlockhub/types';

import { redis, createWorkerConnection } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { STEAM_DAILY_LIMIT, STEAM_BACKGROUND_SYNC_THRESHOLD } from '../config/steamQuota';

import { syncQueue } from './sync.queue';

const backgroundSyncQueue = new Queue('background-sync', { connection: redis });

/**
 * Lanza syncs automáticos agrupados por usuario (un job batch por usuario).
 *
 * Cambio respecto al diseño anterior (un job por plataforma):
 * - Las plataformas de cada usuario se procesan EN SERIE dentro del mismo job.
 * - El jobId determinista `sync-bg-{userId}` garantiza deduplicación nativa de BullMQ:
 *   si el scheduler corre dos veces antes de que el job procese, no se encola duplicado.
 * - Si Steam supera el umbral del 80 %, se omite del array de plataformas del usuario
 *   (no se omite el usuario entero — el resto de plataformas sigue sincronizándose).
 */
export async function runBackgroundSyncs(userId?: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const steamApiKey = `steam:api:calls:${today}`;
  const steamCalls = parseInt((await redis.get(steamApiKey)) ?? '0', 10);

  const steamOverThreshold = steamCalls >= STEAM_DAILY_LIMIT * STEAM_BACKGROUND_SYNC_THRESHOLD;

  if (steamOverThreshold) {
    logger.warn(
      { usagePct: Math.round((steamCalls / STEAM_DAILY_LIMIT) * 100) },
      '[BackgroundSync] Steam API por encima del umbral — Steam omitido del batch por usuario; otras plataformas siguen normalmente',
    );
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const accounts = await prisma.platformAccount.findMany({
    where: userId
      ? { userId }
      : { user: { lastSyncAt: { lte: oneDayAgo } } },
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

  // Agrupar plataformas elegibles por userId (preserva orden de consulta)
  const byUser = new Map<string, { platform: Platform; platformAccountId: string }[]>();
  for (const account of accounts) {
    // A41: omitir Steam del array si supera el umbral — el usuario sigue en el batch con otras plataformas
    if (steamOverThreshold && account.platform === 'STEAM') continue;

    const entry = byUser.get(account.userId);
    const item = { platform: account.platform as Platform, platformAccountId: account.id };
    if (entry) {
      entry.push(item);
    } else {
      byUser.set(account.userId, [item]);
    }
  }

  if (byUser.size === 0) {
    logger.info('[BackgroundSync] Sin plataformas elegibles tras filtrado de cuota Steam');
    return;
  }

  let enqueued = 0;
  for (const [userId, platforms] of byUser) {
    await syncQueue.add(
      `sync-bg-${userId}`,
      { userId, platforms, triggerType: 'auto' },
      {
        jobId: `sync-bg-${userId}`, // deduplicación nativa: solo un job activo por usuario
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 10 },
      },
    );
    enqueued++;
  }

  logger.info(
    { userCount: enqueued, accountCount: accounts.length },
    '[BackgroundSync] Jobs de sync encolados — 1 por usuario',
  );
}

/**
 * Worker que procesa los jobs de la cola 'background-sync'.
 * Cada job dispara runBackgroundSyncs() que encola un sync-bg-{userId} en la cola 'sync'
 * para todos los usuarios elegibles (lastSyncAt > 24h).
 * El job diario lo registra scheduleBackgroundSyncJob() a las 03:00 UTC.
 */
export function startBackgroundSyncWorker() {
  const worker = new Worker(
    'background-sync',
    async () => {
      await runBackgroundSyncs();
    },
    { connection: createWorkerConnection() },
  );

  worker.on('failed', (_job, err) => {
    logger.error({ err: err.message }, '[BackgroundSyncWorker] Job fallido');
  });

  return worker;
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
