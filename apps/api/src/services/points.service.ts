import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import type { PaginatedResponse, PointReason } from '@unlockhub/types';

export interface PointEntry {
  id: string;
  amount: number;
  reason: PointReason;
  createdAt: string;
}

export async function awardPoints(
  userId: string,
  amount: number,
  reason: PointReason,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError('Usuario no encontrado.', 'USER_NOT_FOUND', 404);

  await prisma.userPoint.create({ data: { userId, amount, reason } });
}

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

export async function getPointsTotal(userId: string): Promise<number> {
  const result = await prisma.userPoint.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}
