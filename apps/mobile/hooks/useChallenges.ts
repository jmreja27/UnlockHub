import { useQuery } from '@tanstack/react-query';
import type { WeeklyChallenge, UserChallenge } from '@unlockhub/types';

import { api } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';

interface ActiveChallengeResponse {
  challenge: WeeklyChallenge | null;
}

interface ChallengeStatusResponse {
  status: UserChallenge | null;
}

export function useChallenges() {
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);

  const challengeQuery = useQuery({
    queryKey: ['challenge', 'active'] as const,
    queryFn: () => api.get<ActiveChallengeResponse>('/api/v1/challenges/active'),
    staleTime: 60_000,
  });

  const statusQuery = useQuery({
    queryKey: ['challenge', 'me'] as const,
    queryFn: () => api.get<ChallengeStatusResponse>('/api/v1/challenges/me'),
    staleTime: 30_000,
    enabled: isAuthenticated,
  });

  const challenge = challengeQuery.data?.challenge ?? null;
  const status = statusQuery.data?.status ?? null;

  const progressPct =
    challenge && status
      ? Math.min(100, Math.round((status.progress / challenge.targetValue) * 100))
      : 0;

  return {
    challenge,
    status,
    progressPct,
    isLoading: challengeQuery.isLoading,
    isError: challengeQuery.isError,
    error: challengeQuery.error,
    refetch: () => {
      void challengeQuery.refetch();
      void statusQuery.refetch();
    },
  };
}
