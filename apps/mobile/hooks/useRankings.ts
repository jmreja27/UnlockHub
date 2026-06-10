import { useQuery } from '@tanstack/react-query';
import type { PaginatedResponse, RankingEntry } from '@unlockhub/types';

import { api } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';
import { queryKeys } from '../lib/queryKeys';

interface MyRankingResponse {
  rank: number | null;
  xp: number;
}

const RANKING_STALE = 5 * 60 * 1000;
const RANKING_GC = 1000 * 60 * 15;

export function useGlobalRankings(page: number = 1, limit: number = 50) {
  return useQuery({
    queryKey: queryKeys.rankingsGlobal(page, limit),
    queryFn: () =>
      api.get<PaginatedResponse<RankingEntry>>(`/api/v1/rankings/global?page=${page}&limit=${limit}`),
    staleTime: RANKING_STALE,
    gcTime: RANKING_GC,
    placeholderData: (previousData) => previousData,
  });
}

export function usePlatformRanking(platform: string, page: number = 1, limit: number = 50) {
  return useQuery({
    queryKey: queryKeys.rankingsPlatform(platform, page, limit),
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

  return useQuery({
    queryKey: queryKeys.myRanking(platform),
    queryFn: () =>
      api.get<MyRankingResponse>(
        platform ? `/api/v1/rankings/me?platform=${platform}` : '/api/v1/rankings/me',
      ),
    enabled: isAuthenticated,
    staleTime: RANKING_STALE,
    gcTime: RANKING_GC,
  });
}
