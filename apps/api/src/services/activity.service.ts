import { prisma } from '../lib/prisma';
import { friendshipRepository } from '../repositories/friendship.repository';
import type { ActivityEvent, ActivityEventType, PaginatedResponse } from '@unlockhub/types';

function toDto(row: {
  id: string;
  userId: string;
  type: string;
  payload: unknown;
  createdAt: Date;
  user?: { id: string; username: string; avatar: string | null } | null;
}): ActivityEvent {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as ActivityEventType,
    payload: row.payload as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    user: row.user ?? undefined,
  };
}

export async function createEvent(
  userId: string,
  type: ActivityEventType,
  payload: Record<string, unknown> = {},
): Promise<ActivityEvent> {
  const row = await prisma.activityEvent.create({
    data: { userId, type, payload: payload as object },
    include: { user: { select: { id: true, username: true, avatar: true } } },
  });
  return toDto(row);
}

export async function getFriendsFeed(
  userId: string,
  page: number,
  limit: number,
): Promise<PaginatedResponse<ActivityEvent>> {
  const friendIds = await friendshipRepository.findAcceptedFriendIds(userId);

  // El feed incluye también los eventos propios del usuario
  const authorIds = [...friendIds, userId];
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    prisma.activityEvent.findMany({
      where: { userId: { in: authorIds } },
      include: { user: { select: { id: true, username: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.activityEvent.count({ where: { userId: { in: authorIds } } }),
  ]);

  return { data: rows.map(toDto), total, page, limit };
}

export async function getPublicFeed(
  page: number,
  limit: number,
): Promise<PaginatedResponse<ActivityEvent>> {
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    prisma.activityEvent.findMany({
      include: { user: { select: { id: true, username: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.activityEvent.count(),
  ]);

  return { data: rows.map(toDto), total, page, limit };
}
