import { Worker } from 'bullmq';

import { createWorkerConnection } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { steamAdapter } from '../platforms/steam.adapter';
import { retroAchievementsAdapter } from '../platforms/retroachievements.adapter';
import { psnAdapter } from '../platforms/psn.adapter';
import { xboxAdapter } from '../platforms/xbox.adapter';
import { sendPush } from '../services/notification.service';
import type { SyncJobData, SyncJobResult } from './sync.queue';
import { logger } from '../lib/logger';

const ADAPTERS = {
  STEAM: steamAdapter,
  RA: retroAchievementsAdapter,
  PSN: psnAdapter,
  XBOX: xboxAdapter,
} as const;

const PLATFORM_LABELS: Record<string, string> = {
  STEAM: 'Steam',
  RA: 'RetroAchievements',
  PSN: 'PlayStation',
  XBOX: 'Xbox',
};

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

      // Capturar logros antes del sync para detectar cuáles son nuevos
      const prevEarnedIds = new Set(
        (
          await prisma.userAchievement.findMany({
            where: { userId },
            select: { achievementId: true },
          })
        ).map((a) => a.achievementId),
      );

      const result = await adapter.syncUser(account);

      await prisma.platformAccount.update({
        where: { id: platformAccountId },
        data: { lastSyncedAt: new Date() },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { lastSyncAt: new Date() },
      });

      // Enviar push por cada logro nuevo (máximo 3 para no saturar al usuario)
      const newAchievements = await prisma.userAchievement.findMany({
        where: {
          userId,
          achievementId: { notIn: [...prevEarnedIds] },
        },
        include: { achievement: { select: { title: true, normalizedPoints: true } } },
        take: 3,
        orderBy: { unlockedAt: 'desc' },
      });

      for (const ua of newAchievements) {
        await sendPush(
          userId,
          '🏆 ¡Nuevo logro desbloqueado!',
          `${ua.achievement.title} · ${PLATFORM_LABELS[platform] ?? platform} · +${ua.achievement.normalizedPoints} XP`,
          { achievementId: ua.achievementId, platform },
        ).catch((err: unknown) => {
          logger.warn({ err: (err as Error).message }, '[SyncWorker] Push notification fallida');
        });
      }

      return {
        achievementsSynced: result.achievementsSynced,
        gamesUpdated: result.gamesUpdated,
        syncedAt: result.syncedAt,
      };
    },
    { connection: createWorkerConnection(), concurrency: 5 },
  );

  worker.on('completed', (job) => {
    logger.info({ platform: job.data.platform, userId: job.data.userId }, 'Sync completado');
  });

  worker.on('failed', (job, err) => {
    logger.error({ platform: job?.data.platform, userId: job?.data.userId, err: err.message }, 'Sync fallido');
  });

  return worker;
}
