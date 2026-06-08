import { useEffect, useRef, useCallback } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import type { ActivityEvent, CursorPaginatedResponse } from '@unlockhub/types';

import { api } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';

const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000';
const FEED_KEY = ['feed'] as const;
const FEED_LIMIT = 20;
const MAX_RECONNECT_DELAY_MS = 30_000;
const BASE_RECONNECT_DELAY_MS = 1_000;

export function useFeed() {
  const queryClient = useQueryClient();
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  const accessToken = useSessionStore((s) => s.accessToken);
  const socketRef = useRef<Socket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query = useInfiniteQuery<CursorPaginatedResponse<ActivityEvent>>({
    queryKey: FEED_KEY,
    queryFn: ({ pageParam }) => {
      const cursor = pageParam as string | undefined;
      const url = cursor
        ? `/api/v1/activity/feed?limit=${FEED_LIMIT}&cursor=${encodeURIComponent(cursor)}`
        : `/api/v1/activity/feed?limit=${FEED_LIMIT}`;
      return api.get<CursorPaginatedResponse<ActivityEvent>>(url);
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
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
      queryClient.setQueryData<{ pages: CursorPaginatedResponse<ActivityEvent>[]; pageParams: unknown[] }>(
        FEED_KEY,
        (prev) => {
          if (!prev) return prev;
          const firstPage = prev.pages[0];
          if (!firstPage) return prev;
          return {
            ...prev,
            pages: [
              { ...firstPage, data: [event, ...firstPage.data].slice(0, FEED_LIMIT) },
              ...prev.pages.slice(1),
            ],
          };
        },
      );
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

  const events = query.data?.pages.flatMap((p) => p.data) ?? [];

  return {
    events,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
