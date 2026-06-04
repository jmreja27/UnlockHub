import { useQuery } from '@tanstack/react-query';
import type { FriendshipStatusResult } from '@unlockhub/types';

import { api } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';

export function useFriendshipStatus(username: string) {
  const user = useSessionStore((s) => s.user);

  return useQuery({
    queryKey: ['friendship-status', username],
    queryFn: () => api.get<FriendshipStatusResult>(`/api/v1/friends/status/${username}`),
    enabled: !!user && user.username !== username,
    staleTime: 30_000,
  });
}
