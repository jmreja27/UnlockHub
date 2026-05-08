import { Worker } from 'bullmq';

import { createWorkerConnection } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { steamAdapter } from '../platforms/steam.adapter';
import { retroAchievementsAdapter } from '../platforms/retroachievements.adapter';
import { psnAdapter } from '../platforms/psn.adapter';
import { xboxAdapter } from '../platforms/xbox.adapter';
import type { SyncJobData, SyncJobResult } from './sync.queue';

const ADAPTERS = {
  STEAM: steamAdapter,
  RA: retroAchievementsAdapter,
  PSN: psnAdapter,
  XBOX: xboxAdapter,
} as const;

export function startSyncWorker() {
  const worker = new Worker<SyncJobData, SyncJobResult>(
    'sync',
    async (job) => {
      const { userId, platformAccountId, platform } = job.data;

      const account = await prisma.platformAccount.findUnique({
        where: { id: platformAccountId },
      });
      if (!account) throw new Error(`PlatformAccount ${platformAccountId} no encontrada`);

      const adapter = ADAPTERS[platform as keyof typeof ADAPTERS];
      if (!adapter) throw new Error(`Plataforma ${platform} no soportada`);

      const result = await adapter.syncUser(account);

      await prisma.platformAccount.update({
        where: { id: platformAccountId },
        data: { lastSyncedAt: new Date() },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { lastSyncAt: new Date() },
      });

      return {
        achievementsSynced: result.achievementsSynced,
        gamesUpdated: result.gamesUpdated,
        syncedAt: result.syncedAt,
      };
    },
    { connection: createWorkerConnection(), concurrency: 5 },
  );

  worker.on('completed', (job) => {
    console.warn(`Sync completado [${job.data.platform}] user=${job.data.userId}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Sync fallido [${job?.data.platform}] user=${job?.data.userId}:`, err.message);
  });

  return worker;
}
