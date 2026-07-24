import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

export interface CreateNotificationData {
  userId: string;
  type: string;
  title: string;
  body: string;
  relatedId?: string;
}

export async function createNotification(data: CreateNotificationData) {
  return prisma.notification.create({ data });
}

export async function getNotifications(
  userId: string,
  page: number,
  limit: number,
): Promise<{ data: object[]; total: number; page: number; limit: number }> {
  const skip = (page - 1) * limit;

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where: { userId } }),
  ]);

  return { data: notifications, total, page, limit };
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}

export async function markOneRead(userId: string, notificationId: string): Promise<void> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { userId: true },
  });

  if (!notification) {
    throw new AppError('Notificación no encontrada', 'NOTIFICATION_NOT_FOUND', 404);
  }
  if (notification.userId !== userId) {
    throw new AppError('Sin permiso para modificar esta notificación', 'FORBIDDEN', 403);
  }

  await prisma.notification.update({
    where: { id: notificationId },
    data: { read: true },
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, read: false } });
}
