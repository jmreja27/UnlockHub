import type { ActivityEvent, ActivityEventType, CursorPaginatedResponse } from '@unlockhub/types';

import { prisma } from '../lib/prisma';
import { friendshipRepository } from '../repositories/friendship.repository';

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
  limit: number,
  cursor?: string,
): Promise<CursorPaginatedResponse<ActivityEvent>> {
  const friendIds = await friendshipRepository.findAcceptedFriendIds(userId);

  // El feed incluye también los eventos propios del usuario
  const authorIds = [...friendIds, userId];

  const rows = await prisma.activityEvent.findMany({
    where: {
      userId: { in: authorIds },
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    include: { user: { select: { id: true, username: true, avatar: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const lastRow = rows[rows.length - 1];
  const nextCursor = rows.length === limit && lastRow ? lastRow.id : null;

  return { data: rows.map(toDto), nextCursor };
}

export async function getPublicFeed(
  limit: number,
  cursor?: string,
): Promise<CursorPaginatedResponse<ActivityEvent>> {
  const rows = await prisma.activityEvent.findMany({
    where: {
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    include: { user: { select: { id: true, username: true, avatar: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const lastRow = rows[rows.length - 1];
  const nextCursor = rows.length === limit && lastRow ? lastRow.id : null;

  return { data: rows.map(toDto), nextCursor };
}
