import { useQuery } from '@tanstack/react-query';
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

interface LibraryResponse {
  data: LibraryGame[];
  total: number;
}

export function useMyGames(platform?: string) {
  const { isAuthenticated } = useSessionStore();
  const url = platform
    ? `/api/v1/users/me/games?platform=${platform}`
    : '/api/v1/users/me/games';

  return useQuery({
    queryKey: ['my-games', platform ?? 'all'],
    queryFn: () => api.get<LibraryResponse>(url),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 3,
    gcTime: 1000 * 60 * 15,
  });
}
