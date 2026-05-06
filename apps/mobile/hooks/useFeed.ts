import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { api } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';
import type { ActivityEvent, PaginatedResponse } from '@unlockhub/types';

const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000';
const FEED_KEY = ['feed'] as const;

export function useFeed() {
  const queryClient = useQueryClient();
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  const accessToken = useSessionStore((s) => s.accessToken);
  const socketRef = useRef<Socket | null>(null);

  const query = useQuery({
    queryKey: FEED_KEY,
    queryFn: () => api.get<PaginatedResponse<ActivityEvent>>('/api/v1/activity/feed?limit=30'),
    staleTime: 30_000,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!isAuthenticated) return;

    const socket = io(`${API_URL}/activity`, {
      transports: ['websocket'],
      auth: { token: accessToken },
    });
    socketRef.current = socket;

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

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, accessToken, queryClient]);

  return {
    events: query.data?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
