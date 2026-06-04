import { Queue, Worker } from 'bullmq';

import { redis, createWorkerConnection } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const SHIELD_QUEUE = 'streak-shields-recharge';

const FREE_MAX_SHIELDS = 1;
const PREMIUM_MAX_SHIELDS = 3;

const shieldQueue = new Queue(SHIELD_QUEUE, { connection: redis });

// Recarga de escudos el día 1 de cada mes a las 01:00 UTC
export async function scheduleShieldRecharge(): Promise<void> {
  const repeatable = await shieldQueue.getRepeatableJobs();
  for (const job of repeatable) {
    await shieldQueue.removeRepeatableByKey(job.key);
  }

  await shieldQueue.add(
    'monthly-shield-recharge',
    {},
    {
      repeat: { pattern: '0 1 1 * *', tz: 'UTC' },
      jobId: 'monthly-shield-recharge',
    },
  );

  logger.info('[ShieldScheduler] Recarga mensual de escudos programada (0 1 1 * * UTC)');
}

async function rechargeShields(): Promise<void> {
  const BATCH = 500;
  let cursor = '';
  let total = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const users = await prisma.user.findMany({
      where: cursor ? { id: { gt: cursor } } : {},
      select: { id: true, isPremium: true },
      orderBy: { id: 'asc' },
      take: BATCH,
    });

    if (users.length === 0) break;

    for (const user of users) {
      const maxShields = user.isPremium ? PREMIUM_MAX_SHIELDS : FREE_MAX_SHIELDS;
      await prisma.user.update({
        where: { id: user.id },
        data: { streakShields: maxShields },
      });
    }

    total += users.length;
    cursor = users[users.length - 1]!.id;
    if (users.length < BATCH) break;
  }

  logger.info({ total }, '[ShieldScheduler] Escudos recargados');
}

export const shieldWorker = new Worker(
  SHIELD_QUEUE,
  async () => {
    await rechargeShields();
  },
  { connection: createWorkerConnection(), concurrency: 1 },
);

shieldWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id ?? 'unknown', err: err.message }, '[ShieldWorker] Job fallido');
});
