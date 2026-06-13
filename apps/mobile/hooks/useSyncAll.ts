import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { PlatformAccount } from '@unlockhub/types';

import { api, ApiRequestError } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

const COOLDOWN_MS = 30 * 60 * 1000;

type SyncApiResult = { jobId?: string; platform: string; skippedByQuota?: boolean };
type SteamQuotaState = 'exceeded' | 'skipped' | null;

/**
 * Hook que lanza un sync manual de todas las plataformas vinculadas del usuario.
 *
 * Implementa un cooldown local de 30 minutos entre syncs consecutivos (cliente).
 * La invalidación de 'my-games' la gestiona useSyncProgress vía Socket.io, no este hook.
 *
 * @param userId - ID del usuario autenticado. El hook está deshabilitado si es undefined.
 * @returns sync() para lanzar el sync, isSyncing, isInCooldown, cooldownRemaining (en minutos),
 *          steamQuotaState ('exceeded'|'skipped'|null) para mostrar aviso de cuota agotada.
 */
export function useSyncAll(userId: string | undefined) {
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [steamQuotaState, setSteamQuotaState] = useState<SteamQuotaState>(null);

  const { data: platforms } = useQuery({
    queryKey: queryKeys.platforms(userId ?? ''),
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
      setSteamQuotaState(null);
      const linked = platforms ?? [];
      const results = await Promise.allSettled(
        linked.map((p) => api.post<SyncApiResult>(`/api/v1/sync/${p.platform.toLowerCase()}`)),
      );

      // Detectar Steam omitido por cuota (múltiples plataformas — respuesta 200 con skippedByQuota)
      const steamSkipped = results.some(
        (r) => r.status === 'fulfilled' && r.value?.skippedByQuota === true,
      );
      // Detectar cuota agotada cuando Steam era la única plataforma (429 STEAM_QUOTA_EXCEEDED)
      const steamExceeded = results.some(
        (r) =>
          r.status === 'rejected' &&
          r.reason instanceof ApiRequestError &&
          r.reason.apiError.code === 'STEAM_QUOTA_EXCEEDED',
      );

      return {
        quotaState: (steamExceeded ? 'exceeded' : steamSkipped ? 'skipped' : null) as SteamQuotaState,
      };
    },
    onSuccess: (data) => {
      setLastSyncedAt(new Date());
      setSteamQuotaState(data.quotaState);
      // La invalidación de ['my-games'] la gestiona useSyncProgress vía Socket.io
    },
  });

  return {
    sync: mutation.mutate,
    isSyncing: mutation.isPending,
    isInCooldown,
    cooldownRemaining,
    hasPlatforms: (platforms?.length ?? 0) > 0,
    steamQuotaState,
  };
}
