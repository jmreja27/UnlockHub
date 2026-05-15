import { useInfiniteQuery } from '@tanstack/react-query';

import { api } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';

export interface LibraryGame {
  id: string;
  title: string;
  platform: string;
  iconUrl: string | null;
  totalAchievements: number;
  earnedAchievements: number;
  completionPct: number;
  lastSyncedAt: string | null;
}

interface LibraryPage {
  data: LibraryGame[];
  total: number;
  page: number;
  limit: number;
}

const LIMIT = 20;

export function useMyGames(platform?: string) {
  const { isAuthenticated } = useSessionStore();

  const query = useInfiniteQuery({
    queryKey: ['my-games', platform ?? 'all'],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ page: String(pageParam), limit: String(LIMIT) });
      if (platform) params.set('platform', platform);
      return api.get<LibraryPage>(`/api/v1/users/me/games?${params.toString()}`);
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.data.length, 0);
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    initialPageParam: 1,
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 3,
    gcTime: 1000 * 60 * 15,
  });

  const allGames = query.data?.pages.flatMap((p) => p.data) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;

  return {
    ...query,
    allGames,
    total,
  };
}
