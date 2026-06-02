// Hook para obtener los rankings globales y la posición del usuario actual
import { useQuery } from '@tanstack/react-query';
import type { PaginatedResponse, RankingEntry } from '@unlockhub/types';

import { api } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';

interface MyRankingResponse {
  rank: number | null;
  xp: number;
}

const RANKING_KEYS = {
  global: (page: number, limit: number) => ['rankings', 'global', page, limit] as const,
  platform: (platform: string, page: number, limit: number) => ['rankings', 'platform', platform, page, limit] as const,
  me: ['rankings', 'me'] as const,
};

const RANKING_STALE = 1000 * 60 * 2;
const RANKING_GC = 1000 * 60 * 15;

export function useGlobalRankings(page: number = 1, limit: number = 50) {
  return useQuery({
    queryKey: RANKING_KEYS.global(page, limit),
    queryFn: () =>
      api.get<PaginatedResponse<RankingEntry>>(`/api/v1/rankings/global?page=${page}&limit=${limit}`),
    staleTime: RANKING_STALE,
    gcTime: RANKING_GC,
    placeholderData: (previousData) => previousData,
  });
}

export function usePlatformRanking(platform: string, page: number = 1, limit: number = 50) {
  return useQuery({
    queryKey: RANKING_KEYS.platform(platform, page, limit),
    queryFn: () =>
      api.get<PaginatedResponse<RankingEntry>>(`/api/v1/rankings/platform/${platform}?page=${page}&limit=${limit}`),
    enabled: !!platform,
    staleTime: RANKING_STALE,
    gcTime: RANKING_GC,
    placeholderData: (previousData) => previousData,
  });
}

export function useMyRanking(platform?: string) {
  const { isAuthenticated } = useSessionStore();

  // Incluir el filtro en la queryKey para que global y plataforma usen cachés separados
  const queryKey = platform
    ? ([...RANKING_KEYS.me, platform] as const)
    : RANKING_KEYS.me;
  const url = platform
    ? `/api/v1/rankings/me?platform=${platform}`
    : '/api/v1/rankings/me';

  return useQuery({
    queryKey,
    queryFn: () => api.get<MyRankingResponse>(url),
    enabled: isAuthenticated,
    staleTime: RANKING_STALE,
    gcTime: RANKING_GC,
  });
}
