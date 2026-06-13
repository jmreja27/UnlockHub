import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';

import { useSessionStore } from '../stores/sessionStore';
import { useSyncAll } from '../hooks/useSyncAll';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { useTheme } from '../hooks/useTheme';
import { queryKeys } from '../lib/queryKeys';

// Formatea segundos a string legible (misma lógica que useSyncStatus.formatDuration)
function formatCountdown(secs: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (secs <= 0) return t('library.sync_now');
  const totalMin = Math.ceil(secs / 60);
  if (totalMin < 60) return t('library.sync_duration_min', { min: totalMin });
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (mins === 0) return t('library.sync_duration_h', { h: hours });
  return t('library.sync_duration_hm', { h: hours, min: mins });
}

interface SyncStatusBarProps {
  /** Recibido desde LibraryScreen (que ya instancia useSyncProgress) para evitar un segundo set de listeners Socket.io y timers de polling. */
  isRunning: boolean;
}

export function SyncStatusBar({ isRunning }: SyncStatusBarProps) {
  const { t } = useTranslation();
  const colors = useTheme();
  const queryClient = useQueryClient();
  const user = useSessionStore((s) => s.user);
  const userId = user?.id;
  const isPremium = user?.isPremium ?? false;

  const { sync, isSyncing, steamQuotaState } = useSyncAll(userId);
  const {
    canSyncNow,
    timeUntilNextAutoSync,
    timeUntilCooldownEnds,
    lastSyncRelative,
    syncsRemaining,
    dailySyncsLimit,
    anyPlatformLinked,
    cooldownRemainingSeconds,
  } = useSyncStatus(userId);

  const activeSyncRunning = isSyncing || isRunning;

  // PARTE 5 — contador de tiempo que lleva activo el sync
  const [syncElapsed, setSyncElapsed] = useState(0);
  useEffect(() => {
    if (!activeSyncRunning) {
      setSyncElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setSyncElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSyncRunning]);

  // PARTE 7 — countdown local del cooldown (1s), independiente del refetchInterval 60s
  const [countdownSecs, setCountdownSecs] = useState<number | null>(null);

  // Inicializar / reinicializar el countdown cuando la API devuelve datos nuevos
  useEffect(() => {
    if (!canSyncNow && !activeSyncRunning && cooldownRemainingSeconds > 0) {
      setCountdownSecs(cooldownRemainingSeconds);
    } else {
      setCountdownSecs(null);
    }
  }, [cooldownRemainingSeconds, canSyncNow, activeSyncRunning]);

  // Tick del countdown: decrementa 1 por segundo hasta 0
  useEffect(() => {
    if (countdownSecs === null || countdownSecs <= 0) return;
    const timer = setTimeout(() => {
      setCountdownSecs((prev) => (prev !== null && prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdownSecs]);

  // Cuando el countdown llega a 0: el cooldown ha expirado — refrescar el estado
  useEffect(() => {
    if (countdownSecs === 0) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.syncSummaryBase() });
    }
  }, [countdownSecs, queryClient]);

  // Retorno temprano DESPUÉS de todos los hooks
  if (!anyPlatformLinked) return null;

  // Etiqueta y accesibilidad del botón de sync
  const cooldownDisplay =
    countdownSecs !== null && countdownSecs > 0
      ? formatCountdown(countdownSecs, t)
      : timeUntilCooldownEnds;

  let buttonLabel: string;
  let buttonA11y: string;
  let buttonDisabled: boolean;

  if (activeSyncRunning) {
    buttonLabel = t('library.sync_button_syncing');
    buttonA11y = t('library.sync_button_syncing_a11y');
    buttonDisabled = true;
  } else if (!canSyncNow && cooldownDisplay) {
    buttonLabel = t('library.sync_button_cooldown', { time: cooldownDisplay });
    buttonA11y = t('library.sync_button_cooldown_a11y', { time: cooldownDisplay });
    buttonDisabled = true;
  } else {
    buttonLabel = t('library.sync_button');
    buttonA11y = t('library.sync_button_a11y');
    buttonDisabled = false;
  }

  // Syncs restantes — solo para usuarios free (limit !== null)
  let syncsLabel: string | null = null;
  if (dailySyncsLimit !== null) {
    if (syncsRemaining === 0) {
      syncsLabel = t('library.sync_remaining_zero');
    } else {
      syncsLabel = t('library.sync_remaining_other', {
        count: syncsRemaining ?? 0,
        limit: dailySyncsLimit,
      });
    }
  }
  // Premium (dailySyncsLimit === null): no muestra contador

  const showLongSyncWarning = activeSyncRunning && syncElapsed > 30;

  return (
    <View
      testID="sync-status-bar"
      className="flex-row items-center px-4 py-2 gap-3"
      style={{ minHeight: 40 }}
    >
      {/* Botón de sync */}
      <Pressable
        testID="sync-status-button"
        onPress={() => { if (!buttonDisabled) sync(); }}
        disabled={buttonDisabled}
        accessibilityRole="button"
        accessibilityLabel={buttonA11y}
        accessibilityState={{ disabled: buttonDisabled, busy: activeSyncRunning }}
        style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, flexDirection: 'row', gap: 4 }}
      >
        {activeSyncRunning ? (
          <ActivityIndicator
            testID="sync-status-spinner"
            size="small"
            color="#818cf8"
          />
        ) : (
          <Ionicons
            name="refresh"
            size={14}
            color={buttonDisabled ? colors.textMuted : colors.primary}
          />
        )}
        <Text
          className="text-xs font-medium"
          style={{ color: buttonDisabled ? colors.textMuted : colors.primary }}
        >
          {buttonLabel}
        </Text>
      </Pressable>

      {/* Separador */}
      <View style={{ width: 1, height: 12, backgroundColor: colors.border }} />

      {/* Aviso de sync largo — visible cuando lleva >30s en progreso */}
      {/* Aviso de cuota Steam — visible tras un sync que omitió Steam o agotó la cuota */}
      {showLongSyncWarning ? (
        <Text
          testID="sync-long-warning"
          className="text-xs text-amber-400"
          numberOfLines={1}
        >
          {t('library.sync_long_warning')}
        </Text>
      ) : steamQuotaState !== null && !activeSyncRunning ? (
        <Text
          testID="sync-steam-quota-warning"
          className="text-xs"
          style={{ color: steamQuotaState === 'exceeded' ? '#f87171' : '#fbbf24' }}
          numberOfLines={1}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {steamQuotaState === 'exceeded'
            ? t('library.sync_steam_quota_exceeded')
            : t('library.sync_steam_quota_skipped')}
        </Text>
      ) : (
        <>
          {/* Última sync */}
          {lastSyncRelative !== null && (
            <Text
              testID="sync-status-last"
              className="text-xs"
              style={{ color: colors.textMuted }}
              numberOfLines={1}
            >
              {t('library.sync_last', { time: lastSyncRelative })}
            </Text>
          )}

          {/* Próximo auto sync */}
          {timeUntilNextAutoSync !== null && !activeSyncRunning && (
            <>
              <View style={{ width: 1, height: 12, backgroundColor: colors.border }} />
              <Text
                testID="sync-status-next-auto"
                className="text-xs"
                style={{ color: colors.textMuted }}
                numberOfLines={1}
              >
                {isPremium
                  ? t('library.sync_next_auto_premium', { time: timeUntilNextAutoSync })
                  : t('library.sync_next_auto', { time: timeUntilNextAutoSync })}
              </Text>
            </>
          )}

          {/* Syncs restantes (solo si hay límite — tier free) */}
          {syncsLabel !== null && (
            <>
              <View style={{ width: 1, height: 12, backgroundColor: colors.border }} />
              <Text
                testID="sync-status-remaining"
                className="text-xs"
                style={{ color: syncsRemaining === 0 ? '#f87171' : colors.textMuted }}
                numberOfLines={1}
              >
                {syncsLabel}
              </Text>
            </>
          )}
        </>
      )}
    </View>
  );
}
