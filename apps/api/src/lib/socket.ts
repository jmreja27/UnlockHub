import type { Server as HttpServer } from 'http';

import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

import { logger } from './logger';

let _io: Server | null = null;

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

export function initSocketServer(httpServer: HttpServer): Server {
  _io = new Server(httpServer, {
    cors: {
      origin: process.env['CORS_ORIGIN']?.split(',').filter(Boolean) ?? [],
      credentials: true,
    },
    // Forzar WebSocket en clientes nativos (React Native no soporta long-polling bien)
    transports: ['websocket'],
  });

  // Redis adapter para soporte multi-instancia en Fly.io.
  // Requiere dos conexiones independientes: pub y sub.
  const pubClient = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });
  const subClient = pubClient.duplicate();

  pubClient.on('error', (err: Error) =>
    logger.error({ err: err.message }, '[Socket.io pub] Redis error'),
  );
  subClient.on('error', (err: Error) =>
    logger.error({ err: err.message }, '[Socket.io sub] Redis error'),
  );

  _io.adapter(createAdapter(pubClient, subClient));

  return _io;
}

export function getIO(): Server {
  if (!_io) throw new Error('Socket.io no inicializado. Llama a initSocketServer primero.');
  return _io;
}
