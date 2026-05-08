import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';
import type { GamingWrapped } from '@unlockhub/types';

export function useWrapped(year: number) {
  const { isAuthenticated } = useSessionStore();

  return useQuery({
    queryKey: ['wrapped', year],
    queryFn: () => api.get<{ wrapped: GamingWrapped }>(`/api/v1/wrapped/${year}`).then((r) => r.wrapped),
    enabled: isAuthenticated && year >= 2024,
    staleTime: 1000 * 60 * 60, // 1 hora — los datos del wrapped no cambian frecuentemente
  });
}
