import type { AchievementChallengeStatus, PaginatedResponse } from '@unlockhub/types';

import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { ACHIEVEMENT_CHALLENGE_DURATION_DAYS } from '../config/achievementChallenge';

import { createNotification } from './inapp-notification.service';
import { awardPoints } from './points.service';

const challengeSelect = {
  id: true,
  challengerId: true,
  challengedId: true,
  achievementId: true,
  status: true,
  createdAt: true,
  acceptedAt: true,
  expiresAt: true,
  resolvedAt: true,
  winnerId: true,
  pointsAwarded: true,
  challenger: { select: { id: true, username: true, avatar: true } },
  challenged: { select: { id: true, username: true, avatar: true } },
  achievement: { select: { id: true, title: true, iconUrl: true } },
} as const;

export interface AchievementChallengeRow {
  id: string;
  challengerId: string;
  challengedId: string;
  achievementId: string;
  status: AchievementChallengeStatus;
  createdAt: Date;
  acceptedAt: Date | null;
  expiresAt: Date | null;
  resolvedAt: Date | null;
  winnerId: string | null;
  pointsAwarded: number | null;
  challenger: { id: string; username: string; avatar: string | null };
  challenged: { id: string; username: string; avatar: string | null };
  achievement: { id: string; title: string; iconUrl: string | null };
}

const ACTIVE_STATUSES: AchievementChallengeStatus[] = ['PENDING', 'ACCEPTED'];

/**
 * Crea (o reutiliza, si la fila existente ya no está activa) un reto 1v1 sobre un logro concreto.
 * @throws {AppError} SELF_CHALLENGE (400), ACHIEVEMENT_NOT_FOUND (404), NOT_FRIENDS (403),
 *   CHALLENGE_ALREADY_ACTIVE (409) si ya hay un reto PENDING/ACCEPTED para el mismo trío.
 */
export async function createChallenge(
  challengerId: string,
  challengedId: string,
  achievementId: string,
): Promise<AchievementChallengeRow> {
  if (challengerId === challengedId) {
    throw new AppError('No puedes retarte a ti mismo', 'SELF_CHALLENGE', 400);
  }

  const achievement = await prisma.achievement.findUnique({
    where: { id: achievementId },
    select: { id: true, title: true },
  });
  if (!achievement) {
    throw new AppError('Logro no encontrado', 'ACHIEVEMENT_NOT_FOUND', 404);
  }

  const friendship = await prisma.friendship.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { senderId: challengerId, receiverId: challengedId },
        { senderId: challengedId, receiverId: challengerId },
      ],
    },
    select: { id: true },
  });
  if (!friendship) {
    throw new AppError('Solo puedes retar a tus amigos', 'NOT_FRIENDS', 403);
  }

  const existing = await prisma.achievementChallenge.findUnique({
    where: {
      challengerId_challengedId_achievementId: { challengerId, challengedId, achievementId },
    },
    select: { id: true, status: true },
  });

  let challenge: AchievementChallengeRow;

  if (existing) {
    if (ACTIVE_STATUSES.includes(existing.status)) {
      throw new AppError('Ya hay un reto activo para este logro con este usuario', 'CHALLENGE_ALREADY_ACTIVE', 409);
    }

    challenge = await prisma.achievementChallenge.update({
      where: { id: existing.id },
      data: {
        status: 'PENDING',
        acceptedAt: null,
        expiresAt: null,
        resolvedAt: null,
        winnerId: null,
        pointsAwarded: null,
      },
      select: challengeSelect,
    });
  } else {
    challenge = await prisma.achievementChallenge.create({
      data: { challengerId, challengedId, achievementId, status: 'PENDING' },
      select: challengeSelect,
    });
  }

  const challengerUsername = challenge.challenger.username;

  await createNotification({
    userId: challengedId,
    type: 'ACHIEVEMENT_CHALLENGE',
    title: `${challengerUsername} te reta a conseguir un logro`,
    body: achievement.title,
    relatedId: challenge.id,
  });

  return challenge;
}

/**
 * Acepta un reto pendiente. Solo el retado puede aceptarlo. Arranca el plazo fijo desde este momento.
 * @throws {AppError} CHALLENGE_NOT_FOUND (404), FORBIDDEN (403), CHALLENGE_NOT_PENDING (409).
 */
export async function acceptChallenge(challengeId: string, userId: string): Promise<AchievementChallengeRow> {
  const existing = await prisma.achievementChallenge.findUnique({
    where: { id: challengeId },
    select: { id: true, challengedId: true, challengerId: true, status: true },
  });
  if (!existing) {
    throw new AppError('Reto no encontrado', 'CHALLENGE_NOT_FOUND', 404);
  }
  if (existing.challengedId !== userId) {
    throw new AppError('Solo el usuario retado puede aceptar este reto', 'FORBIDDEN', 403);
  }
  if (existing.status !== 'PENDING') {
    throw new AppError('Este reto ya no está pendiente de aceptación', 'CHALLENGE_NOT_PENDING', 409);
  }

  const acceptedAt = new Date();
  const expiresAt = new Date(acceptedAt.getTime() + ACHIEVEMENT_CHALLENGE_DURATION_DAYS * 24 * 60 * 60 * 1000);

  const challenge = await prisma.achievementChallenge.update({
    where: { id: challengeId },
    data: { status: 'ACCEPTED', acceptedAt, expiresAt },
    select: challengeSelect,
  });

  await createNotification({
    userId: existing.challengerId,
    type: 'ACHIEVEMENT_CHALLENGE',
    title: `${challenge.challenged.username} ha aceptado tu reto`,
    body: challenge.achievement.title,
    relatedId: challenge.id,
  });

  return challenge;
}

/**
 * Rechaza un reto pendiente. Solo el retado puede rechazarlo. Notifica al retador.
 * @throws {AppError} CHALLENGE_NOT_FOUND (404), FORBIDDEN (403), CHALLENGE_NOT_PENDING (409).
 */
export async function rejectChallenge(challengeId: string, userId: string): Promise<AchievementChallengeRow> {
  const existing = await prisma.achievementChallenge.findUnique({
    where: { id: challengeId },
    select: { id: true, challengedId: true, challengerId: true, status: true },
  });
  if (!existing) {
    throw new AppError('Reto no encontrado', 'CHALLENGE_NOT_FOUND', 404);
  }
  if (existing.challengedId !== userId) {
    throw new AppError('Solo el usuario retado puede rechazar este reto', 'FORBIDDEN', 403);
  }
  if (existing.status !== 'PENDING') {
    throw new AppError('Este reto ya no está pendiente de aceptación', 'CHALLENGE_NOT_PENDING', 409);
  }

  const challenge = await prisma.achievementChallenge.update({
    where: { id: challengeId },
    data: { status: 'REJECTED' },
    select: challengeSelect,
  });

  await createNotification({
    userId: existing.challengerId,
    type: 'ACHIEVEMENT_CHALLENGE',
    title: `${challenge.challenged.username} ha rechazado tu reto`,
    body: challenge.achievement.title,
    relatedId: challenge.id,
  });

  return challenge;
}

/**
 * Lista los retos (enviados o recibidos) del usuario, filtrable por estado, paginado.
 */
export async function listMyChallenges(
  userId: string,
  status: AchievementChallengeStatus | undefined,
  page: number,
  limit: number,
): Promise<PaginatedResponse<AchievementChallengeRow>> {
  const where = {
    OR: [{ challengerId: userId }, { challengedId: userId }],
    ...(status ? { status } : {}),
  };
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.achievementChallenge.findMany({
      where,
      select: challengeSelect,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.achievementChallenge.count({ where }),
  ]);

  return { data, total, page, limit };
}

/**
 * Resuelve un reto 1v1 cuando uno de los participantes desbloquea el logro retado durante un sync.
 * No-op si no hay ningún reto ACCEPTED y vigente (expiresAt en el futuro) para ese logro y ese usuario.
 * Llamada desde sync.worker.ts por cada logro nuevo — aislada con try/catch por logro en el caller.
 */
export async function resolveAchievementChallenges(
  userId: string,
  achievementId: string,
  _unlockedAt: Date,
): Promise<void> {
  const challenge = await prisma.achievementChallenge.findFirst({
    where: {
      achievementId,
      status: 'ACCEPTED',
      expiresAt: { gt: new Date() },
      OR: [{ challengerId: userId }, { challengedId: userId }],
    },
    select: {
      id: true,
      challengerId: true,
      challengedId: true,
      achievement: { select: { title: true, normalizedPoints: true } },
    },
  });

  if (!challenge) return;

  const loserId = challenge.challengerId === userId ? challenge.challengedId : challenge.challengerId;
  const points = challenge.achievement.normalizedPoints;

  await prisma.achievementChallenge.update({
    where: { id: challenge.id },
    data: { status: 'RESOLVED_WIN', winnerId: userId, resolvedAt: new Date(), pointsAwarded: points },
  });

  await awardPoints(userId, points, 'CHALLENGE');

  await createNotification({
    userId,
    type: 'ACHIEVEMENT_CHALLENGE',
    title: '¡Has ganado el reto!',
    body: challenge.achievement.title,
    relatedId: challenge.id,
  });

  await createNotification({
    userId: loserId,
    type: 'ACHIEVEMENT_CHALLENGE',
    title: 'Has perdido el reto',
    body: challenge.achievement.title,
    relatedId: challenge.id,
  });
}
