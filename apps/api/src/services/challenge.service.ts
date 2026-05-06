import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { awardPoints } from './points.service';
import { createEvent } from './activity.service';
import type { WeeklyChallenge, UserChallenge } from '@unlockhub/types';

function challengeToDto(row: {
  id: string;
  title: string;
  description: string;
  metric: string;
  targetValue: number;
  xpReward: number;
  startAt: Date;
  endAt: Date;
}): WeeklyChallenge {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    metric: row.metric as WeeklyChallenge['metric'],
    targetValue: row.targetValue,
    xpReward: row.xpReward,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
  };
}

function userChallengeToDto(row: {
  id: string;
  userId: string;
  challengeId: string;
  progress: number;
  completedAt: Date | null;
  challenge?: {
    id: string; title: string; description: string; metric: string;
    targetValue: number; xpReward: number; startAt: Date; endAt: Date;
  };
}): UserChallenge {
  return {
    id: row.id,
    userId: row.userId,
    challengeId: row.challengeId,
    progress: row.progress,
    completedAt: row.completedAt?.toISOString() ?? null,
    challenge: row.challenge ? challengeToDto(row.challenge) : undefined,
  };
}

export async function getActiveChallenge(): Promise<WeeklyChallenge | null> {
  const now = new Date();
  const challenge = await prisma.weeklyChallenge.findFirst({
    where: { startAt: { lte: now }, endAt: { gte: now } },
    orderBy: { startAt: 'desc' },
  });
  return challenge ? challengeToDto(challenge) : null;
}

export async function getUserChallengeStatus(userId: string): Promise<UserChallenge | null> {
  const now = new Date();
  const active = await prisma.weeklyChallenge.findFirst({
    where: { startAt: { lte: now }, endAt: { gte: now } },
    orderBy: { startAt: 'desc' },
  });
  if (!active) return null;

  const userChallenge = await prisma.userChallenge.findUnique({
    where: { userId_challengeId: { userId, challengeId: active.id } },
    include: { challenge: true },
  });

  // Si aún no se ha inscrito, creamos el registro con progreso 0
  if (!userChallenge) {
    const created = await prisma.userChallenge.create({
      data: { userId, challengeId: active.id, progress: 0 },
      include: { challenge: true },
    });
    return userChallengeToDto(created);
  }

  return userChallengeToDto(userChallenge);
}

export async function updateProgress(userId: string, challengeId: string, increment: number): Promise<void> {
  const userChallenge = await prisma.userChallenge.findUnique({
    where: { userId_challengeId: { userId, challengeId } },
    include: { challenge: true },
  });

  if (!userChallenge || userChallenge.completedAt) return;

  const newProgress = userChallenge.progress + increment;
  const completed = newProgress >= userChallenge.challenge.targetValue;

  await prisma.userChallenge.update({
    where: { userId_challengeId: { userId, challengeId } },
    data: {
      progress: newProgress,
      completedAt: completed ? new Date() : null,
    },
  });

  if (completed) {
    await awardPoints(userId, userChallenge.challenge.xpReward, 'CHALLENGE');
    void createEvent(userId, 'CHALLENGE_COMPLETED', {
      challengeId,
      title: userChallenge.challenge.title,
      xpReward: userChallenge.challenge.xpReward,
    });
  }
}

export async function createWeeklyChallenge(data: {
  title: string;
  description: string;
  metric: WeeklyChallenge['metric'];
  targetValue: number;
  xpReward: number;
  startAt: Date;
  endAt: Date;
}): Promise<WeeklyChallenge> {
  const existing = await prisma.weeklyChallenge.findFirst({
    where: {
      OR: [
        { startAt: { lte: data.endAt }, endAt: { gte: data.startAt } },
      ],
    },
  });
  if (existing) {
    throw new AppError('Ya existe un reto activo en ese rango de fechas.', 'CHALLENGE_OVERLAP', 409);
  }

  const challenge = await prisma.weeklyChallenge.create({ data });
  return challengeToDto(challenge);
}
