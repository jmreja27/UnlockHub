import { Queue, Worker } from 'bullmq';

import { prisma } from '../lib/prisma';
import { redis, createWorkerConnection } from '../lib/redis';
import { logger } from '../lib/logger';
import { createNotification } from '../services/inapp-notification.service';

// Notifica a ambos participantes de cada reto ACCEPTED vigente los días que le quedan
export async function sendChallengeReminders(): Promise<void> {
  const now = new Date();

  const activeChallenges = await prisma.achievementChallenge.findMany({
    where: { status: 'ACCEPTED', expiresAt: { gt: now } },
    select: {
      id: true,
      challengerId: true,
      challengedId: true,
      expiresAt: true,
      achievement: { select: { title: true } },
    },
  });

  if (activeChallenges.length === 0) return;

  for (const challenge of activeChallenges) {
    // expiresAt siempre presente en un reto ACCEPTED (se fija en acceptChallenge)
    const daysLeft = Math.ceil((challenge.expiresAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    const body = `${challenge.achievement.title} — te quedan ${daysLeft} día${daysLeft === 1 ? '' : 's'}`;

    await createNotification({
      userId: challenge.challengerId,
      type: 'ACHIEVEMENT_CHALLENGE',
      title: 'Recordatorio de reto',
      body,
      relatedId: challenge.id,
    });

    await createNotification({
      userId: challenge.challengedId,
      type: 'ACHIEVEMENT_CHALLENGE',
      title: 'Recordatorio de reto',
      body,
      relatedId: challenge.id,
    });
  }

  logger.info({ count: activeChallenges.length }, '[AchievementChallengeScheduler] Recordatorios enviados');
}

// Expira los retos ACCEPTED cuyo plazo ya venció y notifica a ambos participantes
export async function expireAchievementChallenges(): Promise<void> {
  const now = new Date();

  const expiredChallenges = await prisma.achievementChallenge.findMany({
    where: { status: 'ACCEPTED', expiresAt: { lte: now } },
    select: {
      id: true,
      challengerId: true,
      challengedId: true,
      achievement: { select: { title: true } },
    },
  });

  if (expiredChallenges.length === 0) return;

  for (const challenge of expiredChallenges) {
    await prisma.achievementChallenge.update({
      where: { id: challenge.id },
      data: { status: 'EXPIRED', resolvedAt: now },
    });

    await createNotification({
      userId: challenge.challengerId,
      type: 'ACHIEVEMENT_CHALLENGE',
      title: 'Reto expirado',
      body: challenge.achievement.title,
      relatedId: challenge.id,
    });

    await createNotification({
      userId: challenge.challengedId,
      type: 'ACHIEVEMENT_CHALLENGE',
      title: 'Reto expirado',
      body: challenge.achievement.title,
      relatedId: challenge.id,
    });
  }

  logger.info({ count: expiredChallenges.length }, '[AchievementChallengeScheduler] Retos expirados');
}

const achievementChallengeReminderQueue = new Queue('achievement-challenge-reminder', { connection: redis });
const achievementChallengeExpiryQueue = new Queue('achievement-challenge-expiry', { connection: redis });

export async function scheduleChallengeReminders(): Promise<void> {
  const repeatables = await achievementChallengeReminderQueue.getRepeatableJobs();
  for (const job of repeatables) {
    await achievementChallengeReminderQueue.removeRepeatableByKey(job.key);
  }

  // 09:00 UTC diariamente — franja distinta del sync nocturno (03:00) y del GDPR cleanup (04:00)
  await achievementChallengeReminderQueue.add(
    'daily-challenge-reminders',
    {},
    {
      repeat: { pattern: '0 9 * * *', tz: 'UTC' },
      jobId: 'daily-challenge-reminders',
    },
  );

  logger.info('[AchievementChallengeScheduler] Recordatorios diarios programados (0 9 * * * UTC)');
}

export async function scheduleChallengeExpiry(): Promise<void> {
  const repeatables = await achievementChallengeExpiryQueue.getRepeatableJobs();
  for (const job of repeatables) {
    await achievementChallengeExpiryQueue.removeRepeatableByKey(job.key);
  }

  // 05:00 UTC diariamente — tras el GDPR cleanup (04:00), antes de los recordatorios (09:00)
  await achievementChallengeExpiryQueue.add(
    'daily-challenge-expiry',
    {},
    {
      repeat: { pattern: '0 5 * * *', tz: 'UTC' },
      jobId: 'daily-challenge-expiry',
    },
  );

  logger.info('[AchievementChallengeScheduler] Expiración diaria programada (0 5 * * * UTC)');
}

export const achievementChallengeReminderWorker = new Worker(
  'achievement-challenge-reminder',
  async () => {
    await sendChallengeReminders();
  },
  { connection: createWorkerConnection() },
);

export const achievementChallengeExpiryWorker = new Worker(
  'achievement-challenge-expiry',
  async () => {
    await expireAchievementChallenges();
  },
  { connection: createWorkerConnection() },
);
