import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { api } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';
import type { ActivityEvent, PaginatedResponse } from '@unlockhub/types';

const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000';
const FEED_KEY = ['feed'] as const;
const MAX_RECONNECT_DELAY_MS = 30_000;
const BASE_RECONNECT_DELAY_MS = 1_000;

export function useFeed() {
  const queryClient = useQueryClient();
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  const accessToken = useSessionStore((s) => s.accessToken);
  const socketRef = useRef<Socket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query = useQuery({
    queryKey: FEED_KEY,
    queryFn: () => api.get<PaginatedResponse<ActivityEvent>>('/api/v1/activity/feed?limit=30'),
    staleTime: 30_000,
    enabled: isAuthenticated,
  });

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    const socket = io(`${API_URL}/activity`, {
      transports: ['websocket'],
      auth: { token: accessToken },
      // Desactivar reconexión automática de socket.io — la gestionamos manualmente
      // para aplicar exponential backoff propio
      reconnection: false,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      reconnectAttemptsRef.current = 0;
    });

    socket.on('new_activity', (event: ActivityEvent) => {
      queryClient.setQueryData<PaginatedResponse<ActivityEvent>>(FEED_KEY, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          data: [event, ...prev.data].slice(0, 30),
          total: prev.total + 1,
        };
      });
    });

    socket.on('connect_error', () => {
      socket.disconnect();
      reconnectAttemptsRef.current += 1;
      const delay = Math.min(
        BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttemptsRef.current,
        MAX_RECONNECT_DELAY_MS,
      );
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, delay);
    });

    socket.on('disconnect', (reason) => {
      // Solo reconectar si la desconexión no fue iniciada por el cliente
      if (reason !== 'io client disconnect') {
        reconnectAttemptsRef.current += 1;
        const delay = Math.min(
          BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttemptsRef.current,
          MAX_RECONNECT_DELAY_MS,
        );
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    });
  }, [accessToken, queryClient]);

  useEffect(() => {
    if (!isAuthenticated) return;

    connect();

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      socketRef.current?.disconnect();
      socketRef.current = null;
      reconnectAttemptsRef.current = 0;
    };
  }, [isAuthenticated, connect]);

  return {
    events: query.data?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
