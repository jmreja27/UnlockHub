import { useEffect, useRef } from 'react';
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

  useEffect(() => {
    if (!isAuthenticated) return;
    let unmounted = false;

    function doConnect() {
      if (unmounted) return;
      if (socketRef.current?.connected) return;

      const socket = io(`${API_URL}/activity`, {
        transports: ['websocket'],
        auth: { token: accessToken },
        // Reconexión manual con exponential backoff en vez de la automática de socket.io
        reconnection: false,
      });
      socketRef.current = socket;

      function handleConnect() {
        reconnectAttemptsRef.current = 0;
      }

      function handleNewActivity(event: ActivityEvent) {
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
      }

      function handleConnectError() {
        socket.off('connect', handleConnect);
        socket.off('new_activity', handleNewActivity);
        socket.off('connect_error', handleConnectError);
        socket.off('disconnect', handleDisconnect);
        socket.disconnect();
        reconnectAttemptsRef.current += 1;
        const delay = Math.min(
          BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttemptsRef.current,
          MAX_RECONNECT_DELAY_MS,
        );
        reconnectTimerRef.current = setTimeout(doConnect, delay);
      }

      function handleDisconnect(reason: string) {
        // Solo reconectar si la desconexión no fue iniciada por el cliente
        if (reason !== 'io client disconnect') {
          socket.off('connect', handleConnect);
          socket.off('new_activity', handleNewActivity);
          socket.off('connect_error', handleConnectError);
          socket.off('disconnect', handleDisconnect);
          reconnectAttemptsRef.current += 1;
          const delay = Math.min(
            BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttemptsRef.current,
            MAX_RECONNECT_DELAY_MS,
          );
          reconnectTimerRef.current = setTimeout(doConnect, delay);
        }
      }

      socket.on('connect', handleConnect);
      socket.on('new_activity', handleNewActivity);
      socket.on('connect_error', handleConnectError);
      socket.on('disconnect', handleDisconnect);
    }

    doConnect();

    return () => {
      unmounted = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.off('connect');
        socketRef.current.off('new_activity');
        socketRef.current.off('connect_error');
        socketRef.current.off('disconnect');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
    };
  }, [isAuthenticated, accessToken, queryClient]);

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
