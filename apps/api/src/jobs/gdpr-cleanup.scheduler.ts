import { Queue, Worker } from 'bullmq';

import { prisma } from '../lib/prisma';
import { redis, createWorkerConnection } from '../lib/redis';
import { logger } from '../lib/logger';

// Busca usuarios con soft delete anterior a 30 días y los borra físicamente
export async function runGdprCleanup(): Promise<void> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const deletedUsers = await prisma.user.findMany({
    where: { deletedAt: { lte: thirtyDaysAgo } },
    select: { id: true },
  });

  if (deletedUsers.length === 0) return;

  for (const user of deletedUsers) {
    await prisma.user.delete({ where: { id: user.id } });
    logger.info({ userId: user.id }, '[GDPR] Usuario borrado físicamente tras 30 días de soft delete');
  }

  logger.info({ count: deletedUsers.length }, '[GDPR] Limpieza completada');
}

const gdprCleanupQueue = new Queue('gdpr-cleanup', { connection: redis });

export async function scheduleGdprCleanupJob(): Promise<void> {
  const repeatables = await gdprCleanupQueue.getRepeatableJobs();
  for (const job of repeatables) {
    await gdprCleanupQueue.removeRepeatableByKey(job.key);
  }

  // Ejecutar a las 04:00 UTC diariamente (1h después del background sync)
  await gdprCleanupQueue.add(
    'daily-gdpr-cleanup',
    {},
    {
      repeat: { pattern: '0 4 * * *', tz: 'UTC' },
      jobId: 'daily-gdpr-cleanup',
    },
  );

  logger.info('[GdprCleanupScheduler] Job diario programado (0 4 * * * UTC)');
}

export const gdprCleanupWorker = new Worker(
  'gdpr-cleanup',
  async () => {
    await runGdprCleanup();
  },
  { connection: createWorkerConnection() },
);
