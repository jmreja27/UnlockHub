import { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, RefreshControl, ScrollView, Pressable, TextInput, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import type { SyncCompleteEvent } from '@unlockhub/types';

import { useMyGames } from '../../hooks/useMyGames';
import { useSessionStore } from '../../stores/sessionStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import type { LibrarySortOrder } from '../../stores/preferencesStore';
import { useSyncAll } from '../../hooks/useSyncAll';
import { useSyncProgress } from '../../hooks/useSyncProgress';
import { LibraryGameCard } from '../../components/LibraryGameCard';
import { SkeletonBox } from '../../components/SkeletonBox';
import { EmptyState } from '../../components/EmptyState';
import { AdBanner } from '../../components/AdBanner';
import type { LibraryGame } from '../../hooks/useMyGames';

const PLATFORM_LABELS: Record<string, string> = {
  STEAM: 'Steam',
  RA: 'RetroAchievements',
  PSN: 'PlayStation',
  XBOX: 'Xbox',
};

// ── Componente de banner de progreso por plataforma ──────────────────────────

function SyncProgressBanner({ platform, processed, total, percentComplete }: {
  platform: string;
  processed: number;
  total: number;
  percentComplete: number;
}) {
  const { t } = useTranslation();
  const label = PLATFORM_LABELS[platform] ?? platform;
  const progress = Math.min(Math.max(percentComplete, 0), 100);
  return (
    <View
      className="mx-4 mb-2 px-4 py-3 bg-surface-2 rounded-xl"
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={t('library.syncing_a11y', { platform: label, processed, total })}
    >
      <View className="flex-row items-center justify-between mb-1.5">
        <Text className="text-white text-xs font-semibold">
          {t('library.syncing', { platform: label })}
        </Text>
        <Text className="text-gray-400 text-xs">
          {total > 0 ? `${processed}/${total}` : '…'}
        </Text>
      </View>
      <View className="h-1.5 bg-surface rounded-full overflow-hidden">
        <View
          className="h-full bg-primary-light rounded-full"
          style={{ width: `${progress}%` }}
        />
      </View>
    </View>
  );
}

// ── Tipos y constantes ────────────────────────────────────────────────────────

type PlatformFilter = 'ALL' | 'STEAM' | 'RA' | 'PSN';

// LibrarySortOrder se define en preferencesStore para evitar dependencia circular
// Reexportado aquí para compatibilidad con consumidores directos
export type { LibrarySortOrder };

const FILTERS: { key: PlatformFilter; label: string }[] = [
  { key: 'ALL',   label: 'library.filter_all' },
  { key: 'STEAM', label: 'library.filter_steam' },
  { key: 'RA',    label: 'library.filter_ra' },
  { key: 'PSN',   label: 'library.filter_psn' },
];

// ── Utilidades ────────────────────────────────────────────────────────────────

function formatUpdatedAt(timestamp: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (timestamp === 0) return '';
  const diffMin = Math.floor((Date.now() - timestamp) / 60_000);
  if (diffMin < 1) return t('library.just_updated');
  return t('library.last_updated', { min: diffMin });
}

function sortGames(games: LibraryGame[], order: LibrarySortOrder): LibraryGame[] {
  const copy = [...games];
  switch (order) {
    case 'alpha_asc':
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case 'alpha_desc':
      return copy.sort((a, b) => b.title.localeCompare(a.title));
    case 'pct_desc':
      return copy.sort((a, b) => b.completionPct - a.completionPct);
    case 'pct_asc':
      return copy.sort((a, b) => a.completionPct - b.completionPct);
    case 'last_played':
    default:
      // lastSyncedAt es por plataforma, no por juego — cuando coincide (misma plataforma),
      // desempatar por completionPct desc para un orden estable y con sentido
      return copy.sort((a, b) => {
        const aDate = a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0;
        const bDate = b.lastSyncedAt ? new Date(b.lastSyncedAt).getTime() : 0;
        const dateDiff = bDate - aDate;
        return dateDiff !== 0 ? dateDiff : b.completionPct - a.completionPct;
      });
  }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function LibrarySkeleton() {
  return (
    <View className="px-4 pt-2">
      {Array.from({ length: 7 }).map((_, i) => (
        <View
          key={i}
          className="flex-row items-center bg-surface-card rounded-xl px-4 py-3 mb-2"
          style={{ minHeight: 68 }}
          accessible={false}
          accessibilityElementsHidden
        >
          <SkeletonBox width={44} height={44} borderRadius={8} style={{ marginRight: 12 }} />
          <View className="flex-1">
            <SkeletonBox width="70%" height={14} borderRadius={4} style={{ marginBottom: 6 }} />
            <SkeletonBox width="45%" height={11} borderRadius={4} style={{ marginBottom: 6 }} />
            <SkeletonBox width="100%" height={6} borderRadius={3} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Pantalla principal ────────────────────────────────────────────────────────

export default function LibraryScreen() {
  const { t } = useTranslation();
  const { user } = useSessionStore();
  const { librarySortOrder, setLibrarySortOrder } = usePreferencesStore();
  const [activeFilter, setActiveFilter] = useState<PlatformFilter>('ALL');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [sortModalVisible, setSortModalVisible] = useState(false);

  const handleSyncComplete = useCallback((event: SyncCompleteEvent) => {
    const label = PLATFORM_LABELS[event.platform] ?? event.platform;
    setToast(`${label}: +${event.newAchievements} ${t('library.achievements_short')} · +${event.xpEarned} XP`);
  }, [t]);

  const { activeSyncs, isRunning } = useSyncProgress(handleSyncComplete);

  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!toast) return;
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [toast]);

  const platform = activeFilter === 'ALL' ? undefined : activeFilter;
  const {
    allGames,
    totalEarnedAchievements,
    totalAvailableAchievements,
    totalGames,
    totalCompletedGames,
    isLoading,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    dataUpdatedAt,
  } = useMyGames(platform);

  const { sync, isSyncing, isInCooldown, cooldownRemaining, hasPlatforms } = useSyncAll(user?.id);

  const games = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? allGames.filter((g) => g.title.toLowerCase().includes(q))
      : allGames;
    // Ordenación cliente-side — no afecta a la paginación del backend
    return sortGames(filtered, librarySortOrder ?? 'last_played');
  }, [allGames, search, librarySortOrder]);

  const updatedAtLabel = formatUpdatedAt(dataUpdatedAt, t);

  const renderItem = useCallback(
    ({ item }: { item: LibraryGame }) => <LibraryGameCard game={item} />,
    [],
  );

  const SORT_OPTIONS: { key: LibrarySortOrder; label: string }[] = [
    { key: 'last_played', label: t('library.sort_last_played') },
    { key: 'alpha_asc',   label: t('library.sort_alpha_asc') },
    { key: 'alpha_desc',  label: t('library.sort_alpha_desc') },
    { key: 'pct_desc',    label: t('library.sort_pct_desc') },
    { key: 'pct_asc',     label: t('library.sort_pct_asc') },
  ];

  const activeSortLabel = SORT_OPTIONS.find((o) => o.key === (librarySortOrder ?? 'last_played'))?.label ?? '';

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Cabecera */}
      <View className="px-4 pt-2 pb-2 flex-row items-center justify-between">
        <View className="flex-1 mr-3">
          <Text className="text-white text-2xl font-bold" accessibilityRole="header">
            {t('library.title')}
          </Text>
          {user && (
            <Text className="text-gray-400 text-sm mt-0.5">
              {t('library.subtitle', { username: user.username })}
            </Text>
          )}
          {updatedAtLabel ? (
            <Text
              className="text-gray-600 text-xs mt-0.5"
              accessibilityLabel={updatedAtLabel}
              accessible
            >
              {updatedAtLabel}
            </Text>
          ) : null}
        </View>
        <View className="flex-row items-center gap-2">
          {/* Contadores de logros y juegos — aggregate stats del backend (pre-paginación) */}
          {!isLoading && !isError && totalGames > 0 && (
            <View
              className="items-end"
              accessible
              accessibilityLabel={`${t('library.achievements_progress', { earned: totalEarnedAchievements, total: totalAvailableAchievements })}. ${t('library.games_progress', { completed: totalCompletedGames, total: totalGames })}`}
            >
              <Text className="text-primary-light font-bold text-base" accessibilityElementsHidden>
                {totalEarnedAchievements}
              </Text>
              <Text className="text-gray-500 text-xs" accessibilityElementsHidden>
                / {totalAvailableAchievements} {t('library.achievements_short')}
              </Text>
              <Text className="text-green-400 font-semibold text-sm mt-0.5" accessibilityElementsHidden>
                {totalCompletedGames}<Text className="text-gray-500">/{totalGames}</Text>
              </Text>
              <Text className="text-gray-500 text-xs" accessibilityElementsHidden>
                {t('library.games_short')}
              </Text>
            </View>
          )}
          {hasPlatforms && (
            <Pressable
              onPress={() => sync()}
              disabled={isSyncing || isInCooldown}
              style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
              accessibilityRole="button"
              accessibilityLabel={
                isInCooldown
                  ? t('library.sync_cooldown', { min: cooldownRemaining })
                  : t('library.sync_button')
              }
              accessibilityState={{ disabled: isSyncing || isInCooldown, busy: isSyncing }}
            >
              {isSyncing || isRunning ? (
                <ActivityIndicator size="small" color="#818cf8" />
              ) : (
                <View className="items-center">
                  <Text className={`text-xl ${isInCooldown ? 'text-gray-600' : 'text-primary-light'}`}>⟳</Text>
                  {isInCooldown && (
                    <Text className="text-gray-600 text-xs leading-none">{cooldownRemaining}m</Text>
                  )}
                </View>
              )}
            </Pressable>
          )}
        </View>
      </View>

      {/* Buscador + botón ordenación */}
      <View className="mx-4 mb-2 flex-row gap-2">
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('library.search_placeholder')}
          placeholderTextColor="#6b7280"
          accessibilityLabel={t('library.search_label')}
          className="bg-surface-2 text-white px-4 py-3 rounded-xl text-sm flex-1"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <Pressable
          onPress={() => setSortModalVisible(true)}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
          className="bg-surface-2 px-3 rounded-xl"
          accessibilityRole="button"
          accessibilityLabel={t('library.sort_button_a11y', { current: activeSortLabel })}
        >
          <Text className="text-primary-light text-xs font-semibold" numberOfLines={1}>
            {activeSortLabel} ▼
          </Text>
        </Pressable>
      </View>

      {/* Filtros por plataforma */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: 'center' }}
        accessibilityRole="tablist"
        accessibilityLabel={t('library.filter_label')}
      >
        {FILTERS.map(({ key, label }) => (
          <Pressable
            key={key}
            onPress={() => setActiveFilter(key)}
            className={`px-4 py-2 rounded-full ${activeFilter === key ? 'bg-primary' : 'bg-surface-2'}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeFilter === key }}
            accessibilityLabel={t(label)}
          >
            <Text className={`font-semibold text-sm ${activeFilter === key ? 'text-white' : 'text-gray-400'}`}>
              {t(label)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Banners de progreso de sync — uno por plataforma activa */}
      {Array.from(activeSyncs.values()).map((syncState) => (
        <SyncProgressBanner
          key={syncState.platform}
          platform={syncState.platform}
          processed={syncState.processed}
          total={syncState.total}
          percentComplete={syncState.percentComplete}
        />
      ))}

      {/* Toast de sync completado */}
      {toast && (
        <View
          className="mx-4 mb-2 px-4 py-3 bg-green-900 rounded-xl"
          accessible
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          accessibilityLabel={t('library.sync_complete_a11y', { info: toast })}
        >
          <Text className="text-green-300 text-xs font-semibold">✓ {t('library.sync_complete')}</Text>
          <Text className="text-green-400 text-xs mt-0.5">{toast}</Text>
        </View>
      )}

      {/* Skeleton */}
      {isLoading && <LibrarySkeleton />}

      {/* Error */}
      {isError && !isLoading && (
        <View
          className="flex-1 items-center justify-center px-6"
          accessible
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          <Text className="text-red-400 text-lg font-semibold mb-2">{t('library.error_title')}</Text>
          <Text className="text-gray-400 text-sm text-center mb-6">{t('library.error_message')}</Text>
          <Text
            className="text-primary-light text-base"
            onPress={() => void refetch()}
            accessibilityRole="button"
          >
            {t('common.retry')}
          </Text>
        </View>
      )}

      {/* Lista de juegos */}
      {!isLoading && !isError && (
        <FlashList
          data={games}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          estimatedItemSize={76}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          accessibilityLabel={t('library.list_label')}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage && !search.trim()) {
              void fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor="#818cf8"
              colors={['#4f46e5']}
              accessibilityLabel={t('library.refresh_label')}
            />
          }
          ListEmptyComponent={
            search.trim() ? (
              <View className="items-center justify-center py-8" accessible accessibilityLiveRegion="polite">
                <Text className="text-gray-400 text-base text-center">{t('library.no_results')}</Text>
              </View>
            ) : (
              <EmptyState
                emoji="🎮"
                title={t('library.empty_title')}
                body={t('library.empty_body')}
                ctaLabel={t('library.empty_cta')}
                onCta={() => router.push('/(tabs)/profile')}
              />
            )
          }
          ListFooterComponent={
            <>
              {isFetchingNextPage && (
                <View
                  className="py-4 items-center"
                  accessible
                  accessibilityLiveRegion="polite"
                  accessibilityLabel={t('common.loading')}
                >
                  <ActivityIndicator size="small" color="#818cf8" />
                </View>
              )}
              <AdBanner unitId="home" />
            </>
          }
        />
      )}

      {/* Modal de ordenación */}
      <Modal
        visible={sortModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSortModalVisible(false)}
        accessibilityViewIsModal
      >
        <Pressable
          className="flex-1 bg-black/60 justify-end"
          onPress={() => setSortModalVisible(false)}
          accessibilityLabel={t('common.cancel')}
        >
          <Pressable
            className="bg-surface-card rounded-t-2xl px-4 pt-4 pb-8"
            onPress={() => { /* evitar cierre al pulsar dentro */ }}
          >
            <View className="w-10 h-1 bg-gray-600 rounded-full self-center mb-4" />
            <Text className="text-white font-bold text-base mb-3">
              {t('library.sort_title')}
            </Text>
            {SORT_OPTIONS.map(({ key, label }) => {
              const isActive = (librarySortOrder ?? 'last_played') === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => {
                    setLibrarySortOrder(key);
                    setSortModalVisible(false);
                  }}
                  className={`flex-row items-center justify-between py-3.5 border-b border-surface-2`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isActive }}
                  accessibilityLabel={label}
                >
                  <Text className={`text-sm ${isActive ? 'text-primary-light font-semibold' : 'text-gray-300'}`}>
                    {label}
                  </Text>
                  {isActive && <Text className="text-primary-light text-base">✓</Text>}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
