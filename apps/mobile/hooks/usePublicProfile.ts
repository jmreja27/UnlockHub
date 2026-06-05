import { useQuery } from '@tanstack/react-query';
import type { User, PlatformAccount } from '@unlockhub/types';

import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

export type PublicProfile = User & { platformAccounts: PlatformAccount[] };

export function usePublicProfile(username: string) {
  return useQuery({
    queryKey: queryKeys.publicProfile(username),
    queryFn: () => api.get<PublicProfile>(`/api/v1/users/${encodeURIComponent(username)}`),
    staleTime: 60_000,
    enabled: !!username,
  });
}
