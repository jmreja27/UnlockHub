import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { PlatformAccount } from '@unlockhub/types';

const COOLDOWN_MS = 30 * 60 * 1000;

export function useSyncAll(userId: string | undefined) {
  const queryClient = useQueryClient();
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const { data: platforms } = useQuery({
    queryKey: ['platforms', userId],
    queryFn: () => api.get<PlatformAccount[]>('/api/v1/platforms/'),
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  });

  const isInCooldown = lastSyncedAt
    ? Date.now() - lastSyncedAt.getTime() < COOLDOWN_MS
    : false;

  const cooldownRemaining = lastSyncedAt && isInCooldown
    ? Math.ceil((COOLDOWN_MS - (Date.now() - lastSyncedAt.getTime())) / 60000)
    : 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const linked = platforms ?? [];
      await Promise.allSettled(
        linked.map((p) => api.post(`/api/v1/sync/${p.platform.toLowerCase()}`)),
      );
    },
    onSuccess: () => {
      setLastSyncedAt(new Date());
      void queryClient.invalidateQueries({ queryKey: ['myGames'] });
    },
  });

  return {
    sync: mutation.mutate,
    isSyncing: mutation.isPending,
    isInCooldown,
    cooldownRemaining,
    hasPlatforms: (platforms?.length ?? 0) > 0,
  };
}
