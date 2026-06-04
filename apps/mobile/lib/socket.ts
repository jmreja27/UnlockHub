import { io, type Socket } from 'socket.io-client';

const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000';

let socket: Socket | null = null;

function getAccessToken(): string | null {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
  const { useSessionStore } = require('../stores/sessionStore') as typeof import('../stores/sessionStore');
  return useSessionStore.getState().accessToken;
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      transports: ['websocket'],
    });
  }
  return socket;
}

export function connectSocket(token?: string | null): void {
  const s = getSocket();
  const t = token ?? getAccessToken();
  if (!t) return;
  s.auth = { token: t };
  if (!s.connected) s.connect();
}

export function disconnectSocket(): void {
  socket?.disconnect();
}
