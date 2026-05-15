import type { Server, Socket } from 'socket.io';
import type { ActivityEvent } from '@unlockhub/types';

import { verifyAccessToken } from '../lib/jwt';
import { friendshipRepository } from '../repositories/friendship.repository';

// Cada usuario autenticado se une a su propia room para recibir eventos
function userRoom(userId: string) {
  return `user:${userId}`;
}

export function registerActivityHandler(io: Server): void {
  const activity = io.of('/activity');

  // Middleware de autenticación: extrae userId del token en handshake
  activity.use((socket, next) => {
    const token =
      (socket.handshake.auth['token'] as string | undefined) ??
      (socket.handshake.headers['authorization']?.replace('Bearer ', ''));

    if (!token) return next(new Error('UNAUTHORIZED'));

    try {
      const payload = verifyAccessToken(token);
      (socket.data as { userId: string }).userId = payload.sub;
      next();
    } catch {
      next(new Error('INVALID_TOKEN'));
    }
  });

  activity.on('connection', (socket: Socket) => {
    const userId = (socket.data as { userId: string }).userId;
    void socket.join(userRoom(userId));

    socket.on('disconnect', () => {
      void socket.leave(userRoom(userId));
    });
  });
}

// Emite un nuevo evento de actividad a las rooms de los amigos del autor
export async function broadcastActivityEvent(
  io: Server,
  event: ActivityEvent,
): Promise<void> {
  const activity = io.of('/activity');
  const friendIds = await friendshipRepository.findAcceptedFriendIds(event.userId);

  // El autor también recibe el evento (para sincronizar su propio feed)
  const recipients = [...friendIds, event.userId];

  for (const recipientId of recipients) {
    activity.to(userRoom(recipientId)).emit('new_activity', event);
  }
}
