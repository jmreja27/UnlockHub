import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import { createNotification } from './inapp-notification.service';

/**
 * Reta a un amigo para que consiga un logro concreto.
 * Crea una notificación in-app de tipo ACHIEVEMENT_CHALLENGE en el perfil del amigo.
 */
export async function challengeFriend(
  challengerUserId: string,
  achievementId: string,
  friendUserId: string,
): Promise<{ ok: true }> {
  // No se puede retar a uno mismo
  if (challengerUserId === friendUserId) {
    throw new AppError('No puedes retarte a ti mismo', 'SELF_CHALLENGE', 400);
  }

  // Verificar que el logro existe
  const achievement = await prisma.achievement.findUnique({
    where: { id: achievementId },
    select: { id: true, title: true },
  });

  if (!achievement) {
    throw new AppError('Logro no encontrado', 'ACHIEVEMENT_NOT_FOUND', 404);
  }

  // Verificar que existe amistad aceptada en cualquier dirección
  const friendship = await prisma.friendship.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { senderId: challengerUserId, receiverId: friendUserId },
        { senderId: friendUserId, receiverId: challengerUserId },
      ],
    },
    select: { id: true },
  });

  if (!friendship) {
    throw new AppError('Solo puedes retar a tus amigos', 'NOT_FRIENDS', 403);
  }

  // Obtener el username del retador para componer el título de la notificación
  const challenger = await prisma.user.findUnique({
    where: { id: challengerUserId },
    select: { username: true },
  });

  // challenger siempre existe si el token es válido, pero protegemos igualmente
  const challengerUsername = challenger?.username ?? 'Alguien';

  await createNotification({
    userId: friendUserId,
    type: 'ACHIEVEMENT_CHALLENGE',
    title: `${challengerUsername} te reta a conseguir un logro`,
    body: achievement.title,
  });

  return { ok: true };
}
