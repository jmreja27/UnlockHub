// Hook para obtener los rankings globales y la posición del usuario actual
import { useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';
import type { PaginatedResponse, RankingEntry } from '@unlockhub/types';

interface MyRankingResponse {
  rank: number | null;
  xp: number;
}

// Claves de caché para TanStack Query
const RANKING_KEYS = {
  global: (page: number, limit: number) => ['rankings', 'global', page, limit] as const,
  me: ['rankings', 'me'] as const,
};

// Obtiene el top N del ranking global con paginación
export function useGlobalRankings(page: number = 1, limit: number = 50) {
  return useQuery({
    queryKey: RANKING_KEYS.global(page, limit),
    queryFn: () =>
      api.get<PaginatedResponse<RankingEntry>>(
        `/api/v1/rankings/global?page=${page}&limit=${limit}`,
      ),
    // Los rankings son relativamente estables: stale a los 2 minutos
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 15,
    // Mantener datos anteriores durante la paginación
    placeholderData: (previousData) => previousData,
  });
}

// Obtiene la posición del usuario autenticado en el ranking
export function useMyRanking() {
  const { isAuthenticated } = useSessionStore();

  return useQuery({
    queryKey: RANKING_KEYS.me,
    queryFn: () => api.get<MyRankingResponse>('/api/v1/rankings/me'),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 15,
  });
}
