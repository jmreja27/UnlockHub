import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { api } from '../lib/api';

interface AggregateSyncStatus {
  lastSyncAt: string | null;
  nextAutoSyncAt: string | null;
  cooldownRemainingSeconds: number;
  cooldownUntil: string | null;
  canSyncNow: boolean;
  manualSyncsUsedToday: number;
  dailySyncsLimit: number | null;
  anyPlatformLinked: boolean;
}

export interface SyncStatusResult {
  lastSyncAt: Date | null;
  nextAutoSyncAt: Date | null;
  cooldownUntil: Date | null;
  canSyncNow: boolean;
  manualSyncsUsedToday: number;
  dailySyncsLimit: number | null;
  anyPlatformLinked: boolean;
  // Helpers calculados — string listo para mostrar en UI
  timeUntilNextAutoSync: string | null;
  timeUntilCooldownEnds: string | null;
  lastSyncRelative: string | null;
  syncsRemaining: number | null; // null = ilimitado
}

// Formatea una diferencia de tiempo en segundos a "Xh Ymin" o "Zmin"
function formatDuration(seconds: number, t: (k: string, opts?: Record<string, unknown>) => string): string {
  const totalMinutes = Math.ceil(seconds / 60);
  if (totalMinutes <= 0) return t('library.sync_now');
  if (totalMinutes < 60) return t('library.sync_duration_min', { min: totalMinutes });
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (mins === 0) return t('library.sync_duration_h', { h: hours });
  return t('library.sync_duration_hm', { h: hours, min: mins });
}

// Formatea tiempo relativo pasado para "hace X min", "hace X h", etc.
function formatRelative(date: Date, t: (k: string, opts?: Record<string, unknown>) => string): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return t('library.sync_just_now');
  if (diffMin < 60) return t('library.sync_ago_min', { min: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t('library.sync_ago_h', { h: diffH });
  const diffD = Math.floor(diffH / 24);
  return t('library.sync_ago_d', { d: diffD });
}

export function useSyncStatus(userId: string | undefined): SyncStatusResult {
  const { t } = useTranslation();

  const { data } = useQuery<AggregateSyncStatus>({
    queryKey: ['sync-summary', userId],
    queryFn: () => api.get<AggregateSyncStatus>('/api/v1/sync/my-summary'),
    enabled: !!userId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (!data) {
    return {
      lastSyncAt: null,
      nextAutoSyncAt: null,
      cooldownUntil: null,
      canSyncNow: false,
      manualSyncsUsedToday: 0,
      dailySyncsLimit: null,
      anyPlatformLinked: false,
      timeUntilNextAutoSync: null,
      timeUntilCooldownEnds: null,
      lastSyncRelative: null,
      syncsRemaining: null,
    };
  }

  const lastSyncAt = data.lastSyncAt ? new Date(data.lastSyncAt) : null;
  const nextAutoSyncAt = data.nextAutoSyncAt ? new Date(data.nextAutoSyncAt) : null;
  const cooldownUntil = data.cooldownUntil ? new Date(data.cooldownUntil) : null;

  const now = Date.now();

  const timeUntilNextAutoSync = nextAutoSyncAt
    ? formatDuration(Math.max(0, Math.floor((nextAutoSyncAt.getTime() - now) / 1000)), t)
    : null;

  const timeUntilCooldownEnds =
    cooldownUntil && data.cooldownRemainingSeconds > 0
      ? formatDuration(data.cooldownRemainingSeconds, t)
      : null;

  const lastSyncRelative = lastSyncAt ? formatRelative(lastSyncAt, t) : null;

  const syncsRemaining =
    data.dailySyncsLimit !== null
      ? Math.max(0, data.dailySyncsLimit - data.manualSyncsUsedToday)
      : null;

  return {
    lastSyncAt,
    nextAutoSyncAt,
    cooldownUntil,
    canSyncNow: data.canSyncNow,
    manualSyncsUsedToday: data.manualSyncsUsedToday,
    dailySyncsLimit: data.dailySyncsLimit,
    anyPlatformLinked: data.anyPlatformLinked,
    timeUntilNextAutoSync,
    timeUntilCooldownEnds,
    lastSyncRelative,
    syncsRemaining,
  };
}
