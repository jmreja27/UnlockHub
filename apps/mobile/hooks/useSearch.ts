import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SearchResponse } from '@unlockhub/types';

import { api } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';

export type SearchFilter = 'all' | 'games' | 'users';

const DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 2;

export function useSearch(filter: SearchFilter = 'all') {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  const enabled = debouncedQuery.length >= MIN_QUERY_LENGTH;

  const result = useQuery({
    queryKey: ['search', debouncedQuery, filter],
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
    queryKey: ['game', gameId],
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
    queryKey: ['my-game-achievements', gameId],
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
  iconUrl: string | null;
  headerUrl: string | null;
  totalAchievements: number;
  achievements: AchievementDetail[];
}
