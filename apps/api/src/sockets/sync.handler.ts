import type { Server } from 'socket.io';

import { verifyAccessToken } from '../lib/jwt';
import { logger } from '../lib/logger';

export function userSyncRoom(userId: string): string {
  return `user:${userId}`;
}

export function registerSyncHandler(io: Server): void {
  // Middleware de autenticación JWT en el namespace raíz
  io.use((socket, next) => {
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

  io.on('connection', (socket) => {
    const userId = (socket.data as { userId: string }).userId;
    void socket.join(userSyncRoom(userId));
    logger.debug({ userId }, '[Socket.io /] usuario conectado');

    socket.on('disconnect', () => {
      void socket.leave(userSyncRoom(userId));
    });
  });
}
