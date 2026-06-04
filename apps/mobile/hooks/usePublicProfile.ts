import { useQuery } from '@tanstack/react-query';
import type { User, PlatformAccount } from '@unlockhub/types';

import { api } from '../lib/api';

export type PublicProfile = User & { platformAccounts: PlatformAccount[] };

export function usePublicProfile(username: string) {
  return useQuery({
    queryKey: ['profile', username] as const,
    queryFn: () => api.get<PublicProfile>(`/api/v1/users/${encodeURIComponent(username)}`),
    staleTime: 60_000,
    enabled: !!username,
  });
}
