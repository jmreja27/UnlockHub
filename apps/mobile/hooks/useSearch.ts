import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SearchResponse } from '@unlockhub/types';

import { api } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';
import { queryKeys } from '../lib/queryKeys';

import { useDebounce } from './useDebounce';

export type SearchFilter = 'all' | 'games' | 'users';

const DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 2;

export function useSearch(filter: SearchFilter = 'all') {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query.trim(), DEBOUNCE_MS);

  const enabled = debouncedQuery.length >= MIN_QUERY_LENGTH;

  const result = useQuery({
    queryKey: queryKeys.search(debouncedQuery, filter),
    queryFn: () =>
      api.get<SearchResponse>(
        `/api/v1/search?q=${encodeURIComponent(debouncedQuery)}&type=${filter}`,
      ),
    enabled,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
    placeholderData: (prev) => prev,
  });

  return { query, setQuery, debouncedQuery, enabled, ...result };
}

export function useGameDetail(gameId: string | null) {
  return useQuery({
    queryKey: queryKeys.game(gameId),
    queryFn: () => api.get<GameDetail>(`/api/v1/search/games/${gameId}`),
    enabled: !!gameId,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
  });
}

// Logros ganados por el usuario en un juego concreto — para filtros Desbloqueados/Pendientes
export function useMyGameAchievements(gameId: string | null) {
  const { isAuthenticated } = useSessionStore();
  return useQuery({
    queryKey: queryKeys.myGameAchievements(gameId),
    queryFn: () =>
      api.get<{ achievementId: string; unlockedAt: string }[]>(
        `/api/v1/users/me/games/${gameId}/achievements`,
      ),
    enabled: !!gameId && isAuthenticated,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 15,
  });
}

// Tipo local para el detalle de juego con logros incluidos
interface AchievementDetail {
  id: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
  normalizedPoints: number;
  rarity: number | null;
}

export interface GameDetail {
  id: string;
  platform: string;
  title: string;
  console: string | null;
  iconUrl: string | null;
  headerUrl: string | null;
  totalAchievements: number;
  achievements: AchievementDetail[];
}
