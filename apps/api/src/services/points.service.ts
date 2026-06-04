import type { PaginatedResponse, PointReason } from '@unlockhub/types';

import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { AppError } from '../middleware/errorHandler';

export interface PointEntry {
  id: string;
  amount: number;
  reason: PointReason;
  createdAt: string;
}

/**
 * Registra un movimiento de puntos en el historial auditable del usuario (UserPoint).
 * El saldo se calcula siempre sumando todos los registros — no hay campo de saldo desnormalizado.
 * @throws {AppError} USER_NOT_FOUND (404) si el userId no existe.
 */
export async function awardPoints(
  userId: string,
  amount: number,
  reason: PointReason,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError('Usuario no encontrado.', 'USER_NOT_FOUND', 404);

  await prisma.userPoint.create({ data: { userId, amount, reason } });
}

/**
 * Devuelve el historial paginado de movimientos de puntos del usuario, ordenado por fecha descendente.
 */
export async function getPointsHistory(
  userId: string,
  page: number,
  limit: number,
): Promise<PaginatedResponse<PointEntry>> {
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    prisma.userPoint.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: { id: true, amount: true, reason: true, createdAt: true },
    }),
    prisma.userPoint.count({ where: { userId } }),
  ]);

  return {
    data: rows.map((r) => ({ ...r, reason: r.reason as PointReason, createdAt: r.createdAt.toISOString() })),
    total,
    page,
    limit,
  };
}

/**
 * Calcula el saldo actual de puntos del usuario sumando todos los movimientos de UserPoint.
 * Valores negativos (REDEEM) ya están incluidos en la suma.
 */
export async function getPointsTotal(userId: string): Promise<number> {
  const result = await prisma.userPoint.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

const REWARDED_AD_POINTS = 10;
const REWARDED_AD_COOLDOWN_SECONDS = 3 * 60 * 60; // 3 horas

/**
 * Otorga 10 puntos por ver un anuncio recompensado. Cooldown 3h por usuario en Redis.
 * Usa SET NX EX atómico para evitar race condition entre check y set.
 */
export async function claimRewardedAdPoints(userId: string): Promise<{ pointsEarned: number }> {
  const cooldownKey = `rewarded-ad:${userId}`;

  // SET NX EX es atómico: solo tiene éxito si la clave no existía, evitando la race condition TOCTOU
  const acquired = await redis.set(cooldownKey, '1', 'EX', REWARDED_AD_COOLDOWN_SECONDS, 'NX');

  if (acquired === null) {
    throw new AppError(
      'Ya recibiste puntos por un anuncio recientemente. Vuelve en 3 horas.',
      'REWARDED_AD_COOLDOWN',
      429,
    );
  }

  try {
    await prisma.userPoint.create({ data: { userId, amount: REWARDED_AD_POINTS, reason: 'REWARDED_AD' } });
  } catch (err) {
    // Si falla el guardado en BD, liberar el lock para que el usuario pueda reintentar
    await redis.del(cooldownKey);
    throw err;
  }

  return { pointsEarned: REWARDED_AD_POINTS };
}
