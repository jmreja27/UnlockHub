import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import { useSessionStore } from '../stores/sessionStore';
import { useSyncAll } from '../hooks/useSyncAll';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { useSyncProgress } from '../hooks/useSyncProgress';

export function SyncStatusBar() {
  const { t } = useTranslation();
  const user = useSessionStore((s) => s.user);
  const userId = user?.id;
  const isPremium = user?.isPremium ?? false;

  const { sync, isSyncing } = useSyncAll(userId);
  const { isRunning } = useSyncProgress();
  const {
    canSyncNow,
    timeUntilNextAutoSync,
    timeUntilCooldownEnds,
    lastSyncRelative,
    syncsRemaining,
    dailySyncsLimit,
    anyPlatformLinked,
  } = useSyncStatus(userId);

  if (!anyPlatformLinked) return null;

  const activeSyncRunning = isSyncing || isRunning;

  // Etiqueta y accesibilidad del botón de sync
  let buttonLabel: string;
  let buttonA11y: string;
  let buttonDisabled: boolean;

  if (activeSyncRunning) {
    buttonLabel = t('library.sync_button_syncing');
    buttonA11y = t('library.sync_button_syncing_a11y');
    buttonDisabled = true;
  } else if (!canSyncNow && timeUntilCooldownEnds) {
    buttonLabel = t('library.sync_button_cooldown', { time: timeUntilCooldownEnds });
    buttonA11y = t('library.sync_button_cooldown_a11y', { time: timeUntilCooldownEnds });
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
        style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
        className="flex-row items-center gap-1 bg-surface-elevated rounded-lg px-3 py-1"
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
            color={buttonDisabled ? '#64748b' : '#818cf8'}
          />
        )}
        <Text
          className={`text-xs font-medium ${buttonDisabled ? 'text-gray-500' : 'text-primary'}`}
        >
          {buttonLabel}
        </Text>
      </Pressable>

      {/* Separador */}
      <View className="h-3 w-px bg-gray-700" />

      {/* Última sync */}
      {lastSyncRelative !== null && (
        <Text
          testID="sync-status-last"
          className="text-xs text-gray-500"
          numberOfLines={1}
        >
          {t('library.sync_last', { time: lastSyncRelative })}
        </Text>
      )}

      {/* Próximo auto sync */}
      {timeUntilNextAutoSync !== null && !activeSyncRunning && (
        <>
          <View className="h-3 w-px bg-gray-700" />
          <Text
            testID="sync-status-next-auto"
            className="text-xs text-gray-500"
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
          <View className="h-3 w-px bg-gray-700" />
          <Text
            testID="sync-status-remaining"
            className={`text-xs ${syncsRemaining === 0 ? 'text-red-400' : 'text-gray-500'}`}
            numberOfLines={1}
          >
            {syncsLabel}
          </Text>
        </>
      )}
    </View>
  );
}
