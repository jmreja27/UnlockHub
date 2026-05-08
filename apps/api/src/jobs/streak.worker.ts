import { Worker } from 'bullmq';
import { redis, createWorkerConnection } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { addXp } from '../services/user.service';
import { createEvent } from '../services/activity.service';

const STREAK_XP_REWARD = 50;
const STREAK_MILESTONES = new Set([7, 30, 100]);

export async function processStreaks(): Promise<void> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Procesar en lotes para evitar cargar todos los usuarios en memoria
  const BATCH = 200;
  let cursor = '';
  let processed = 0;

  while (true) {
    const users = await prisma.user.findMany({
      where: cursor ? { id: { gt: cursor } } : {},
      select: { id: true, streakDays: true, countryCode: true, lastSyncAt: true },
      orderBy: { id: 'asc' },
      take: BATCH,
    });

    if (users.length === 0) break;

    for (const user of users) {
      const hadActivity = user.lastSyncAt !== null && user.lastSyncAt >= oneDayAgo;

      if (hadActivity) {
        const newStreak = user.streakDays + 1;
        await prisma.user.update({
          where: { id: user.id },
          data: { streakDays: newStreak },
        });

        // +50 XP por mantener la racha
        await addXp(user.id, STREAK_XP_REWARD, 'STREAK');

        if (STREAK_MILESTONES.has(newStreak)) {
          await redis.set(`streak:milestone:${user.id}`, newStreak, 'EX', 7 * 24 * 3600);
          void createEvent(user.id, 'STREAK_MILESTONE', { days: newStreak });
        }
      } else {
        // Sin actividad — reset de racha
        await prisma.user.update({
          where: { id: user.id },
          data: { streakDays: 0 },
        });
      }
    }

    processed += users.length;
    cursor = users[users.length - 1]!.id;

    if (users.length < BATCH) break;
  }

  console.warn(`[StreakWorker] Rachas procesadas: ${processed} usuarios`);
}

export const streakWorker = new Worker(
  'streak',
  async () => {
    await processStreaks();
  },
  { connection: createWorkerConnection(), concurrency: 1 },
);

streakWorker.on('failed', (job, err) => {
  console.error(`[StreakWorker] Job ${job?.id ?? 'unknown'} fallido:`, err.message);
});
