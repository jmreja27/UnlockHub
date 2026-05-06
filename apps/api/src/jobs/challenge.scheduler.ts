import { Queue, Worker } from 'bullmq';
import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { updateProgress } from '../services/challenge.service';

const challengeQueue = new Queue('challenge', { connection: redis });

// Evalúa el progreso de todos los usuarios en el reto de la semana anterior
async function evaluatePreviousChallenge(): Promise<void> {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const previous = await prisma.weeklyChallenge.findFirst({
    where: { endAt: { gte: oneWeekAgo, lt: now } },
    orderBy: { endAt: 'desc' },
  });
  if (!previous) return;

  const pending = await prisma.userChallenge.findMany({
    where: { challengeId: previous.id, completedAt: null },
    select: { userId: true, progress: true },
  });

  // Los usuarios con progreso >= targetValue pero sin completedAt: completar ahora
  for (const uc of pending) {
    if (uc.progress >= previous.targetValue) {
      await updateProgress(uc.userId, previous.id, 0);
    }
  }

  console.warn(`[ChallengeScheduler] Evaluados ${pending.length} participantes del reto anterior`);
}

export const challengeWorker = new Worker(
  'challenge',
  async () => { await evaluatePreviousChallenge(); },
  { connection: redis, concurrency: 1 },
);

challengeWorker.on('failed', (job, err) => {
  console.error(`[ChallengeWorker] Job ${job?.id ?? 'unknown'} fallido:`, err.message);
});

export async function scheduleChallengeEvaluation(): Promise<void> {
  const repeatable = await challengeQueue.getRepeatableJobs();
  for (const job of repeatable) {
    await challengeQueue.removeRepeatableByKey(job.key);
  }

  // Cada lunes a medianoche UTC: evalúa el reto anterior
  await challengeQueue.add(
    'weekly-challenge-eval',
    {},
    { repeat: { pattern: '0 0 * * 1', tz: 'UTC' }, jobId: 'weekly-challenge-eval' },
  );

  console.warn('[ChallengeScheduler] Evaluación semanal programada (0 0 * * 1 UTC)');
}
