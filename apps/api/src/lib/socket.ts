import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';

let _io: Server | null = null;

export function initSocketServer(httpServer: HttpServer): Server {
  _io = new Server(httpServer, {
    cors: {
      origin: process.env['CORS_ORIGIN']?.split(',').filter(Boolean) ?? [],
      credentials: true,
    },
    // Forzar WebSocket en clientes nativos (React Native no soporta long-polling bien)
    transports: ['websocket'],
  });
  return _io;
}

export function getIO(): Server {
  if (!_io) throw new Error('Socket.io no inicializado. Llama a initSocketServer primero.');
  return _io;
}
