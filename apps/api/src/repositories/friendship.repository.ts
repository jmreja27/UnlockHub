import type { FriendshipStatus } from '@prisma/client';

import { prisma } from '../lib/prisma';

export const friendshipRepository = {
  findBetween(userA: string, userB: string) {
    return prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId: userA, receiverId: userB },
          { senderId: userB, receiverId: userA },
        ],
      },
    });
  },

  findById(id: string) {
    return prisma.friendship.findUnique({ where: { id } });
  },

  create(senderId: string, receiverId: string) {
    return prisma.friendship.create({
      data: { senderId, receiverId, status: 'PENDING' },
    });
  },

  updateStatus(id: string, status: FriendshipStatus) {
    return prisma.friendship.update({ where: { id }, data: { status } });
  },

  delete(id: string) {
    return prisma.friendship.delete({ where: { id } });
  },

  findAcceptedFriends(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    return Promise.all([
      prisma.friendship.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [{ senderId: userId }, { receiverId: userId }],
        },
        include: {
          sender: { select: { id: true, username: true, avatar: true, level: true, xp: true } },
          receiver: { select: { id: true, username: true, avatar: true, level: true, xp: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.friendship.count({
        where: {
          status: 'ACCEPTED',
          OR: [{ senderId: userId }, { receiverId: userId }],
        },
      }),
    ]);
  },

  findPendingReceived(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    return Promise.all([
      prisma.friendship.findMany({
        where: { receiverId: userId, status: 'PENDING' },
        include: {
          sender: { select: { id: true, username: true, avatar: true, level: true, xp: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.friendship.count({ where: { receiverId: userId, status: 'PENDING' } }),
    ]);
  },

  findAcceptedFriendIds(userId: string): Promise<string[]> {
    return prisma.friendship
      .findMany({
        where: {
          status: 'ACCEPTED',
          OR: [{ senderId: userId }, { receiverId: userId }],
        },
        select: { senderId: true, receiverId: true },
      })
      .then((rows) =>
        rows.map((r) => (r.senderId === userId ? r.receiverId : r.senderId)),
      );
  },
};
