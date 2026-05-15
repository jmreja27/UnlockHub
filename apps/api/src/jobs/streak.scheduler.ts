import { Queue } from 'bullmq';

import { redis } from '../lib/redis';
import { logger } from '../lib/logger';

const streakQueue = new Queue('streak', { connection: redis });

export async function scheduleStreakJob(): Promise<void> {
  // Eliminar el job repetible anterior para evitar duplicados al reiniciar
  const repeatable = await streakQueue.getRepeatableJobs();
  for (const job of repeatable) {
    await streakQueue.removeRepeatableByKey(job.key);
  }

  // Lanzar a medianoche UTC todos los días
  await streakQueue.add(
    'daily-streak',
    {},
    {
      repeat: { pattern: '0 0 * * *', tz: 'UTC' },
      jobId: 'daily-streak',
    },
  );

  logger.info('[StreakScheduler] Job de racha diaria programado (0 0 * * * UTC)');
}
