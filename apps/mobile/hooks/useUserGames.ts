import { useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

import type { LibraryGame } from './useMyGames';

interface UserGamesPage {
  data: LibraryGame[];
  total: number;
  page: number;
  limit: number;
  totalEarnedAchievements: number;
  totalAvailableAchievements: number;
  totalGames: number;
  totalCompletedGames: number;
}

export interface UserGameAchievement {
  id: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
  rarity: number | null;
  normalizedPoints: number;
  platform: string;
  externalId: string;
  externalUrl: string | null;
  isUnlocked: boolean;
  unlockedAt: string | null;
  // null cuando no hay sesión o el visitante es el mismo usuario
  isUnlockedByMe: boolean | null;
}

export interface UserGameDetail {
  id: string;
  title: string;
  iconUrl: string | null;
  platform: string;
  totalAchievements: number;
  earnedAchievements: number;
  completionPct: number;
}

export interface UserGameAchievementsResponse {
  game: UserGameDetail;
  achievements: UserGameAchievement[];
  earnedCount: number;
  totalCount: number;
}

/**
 * Fetch de la primera página de juegos (hasta 20) de un usuario público.
 * Respeta la privacidad del perfil: lanza ApiRequestError 403/404 si aplica.
 */
export function useUserGames(username: string) {
  return useQuery({
    queryKey: queryKeys.userGames(username),
    queryFn: () =>
      api.get<UserGamesPage>(
        `/api/v1/users/${encodeURIComponent(username)}/games?page=1&limit=20`,
      ),
    staleTime: 60_000,
    enabled: !!username,
  });
}

/**
 * Fetch de los logros de un juego concreto para un usuario público.
 * Incluye isUnlocked (estado del usuario visitado) e isUnlockedByMe (modo comparación).
 */
export function useUserGameAchievements(username: string, gameId: string) {
  return useQuery({
    queryKey: queryKeys.userGameAchievements(username, gameId),
    queryFn: () =>
      api.get<UserGameAchievementsResponse>(
        `/api/v1/users/${encodeURIComponent(username)}/games/${gameId}/achievements`,
      ),
    staleTime: 60_000,
    enabled: !!username && !!gameId,
  });
}
