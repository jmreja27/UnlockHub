import { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, RefreshControl, ScrollView, Pressable, TextInput, ActivityIndicator, Modal, AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { SyncCompleteEvent } from '@unlockhub/types';

import { useMyGames } from '../../hooks/useMyGames';
import { useSessionStore } from '../../stores/sessionStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import type { LibrarySortOrder } from '../../stores/preferencesStore';
import { useSyncProgress } from '../../hooks/useSyncProgress';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { LibraryGameCard } from '../../components/LibraryGameCard';
import { SyncStatusBar } from '../../components/SyncStatusBar';
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

function sortGames(games: LibraryGame[], order: LibrarySortOrder, isRunning: boolean): LibraryGame[] {
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
    default: {
      // lastActivityAt = MAX(unlockedAt) de los logros del juego — refleja la actividad real.
      // Durante un sync activo, los juegos recién llegados tienen lastActivityAt = null porque
      // aún no tienen logros desbloqueados. Tratarlos como muy recientes para que aparezcan
      // al inicio de la lista y sean visibles inmediatamente.
      const FAR_FUTURE = Date.now() + 1_000_000_000;
      return copy.sort((a, b) => {
        const aDate = a.lastActivityAt
          ? new Date(a.lastActivityAt).getTime()
          : isRunning ? FAR_FUTURE : 0;
        const bDate = b.lastActivityAt
          ? new Date(b.lastActivityAt).getTime()
          : isRunning ? FAR_FUTURE : 0;
        const dateDiff = bDate - aDate;
        return dateDiff !== 0 ? dateDiff : b.completionPct - a.completionPct;
      });
    }
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
  const queryClient = useQueryClient();
  const { anyPlatformLinked } = useSyncStatus(user?.id);
  const { librarySortOrder, setLibrarySortOrder } = usePreferencesStore();
  const [activeFilter, setActiveFilter] = useState<PlatformFilter>('ALL');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [sortModalVisible, setSortModalVisible] = useState(false);

  // Al montar con sesión activa, forzar background refetch para obtener datos frescos
  // aunque el caché sea reciente (< staleTime). Resuelve el caso donde el sync nocturno
  // terminó mientras la app estaba en background y la lista muestra datos del caché stale.
  useEffect(() => {
    if (user?.id) {
      initialLoadDoneRef.current = false;
      void queryClient.invalidateQueries({ queryKey: ['my-games'] });
    }
  }, [user?.id, queryClient]);

  // AppState listener: refrescar la lista cuando la app vuelve al frente desde background.
  // TanStack Query en React Native no tiene refetchOnWindowFocus — este listener lo suple.
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active' && user?.id) {
        // Resetear el ref para que fetchAllRemainingPages se llame si el refetch parcial
        // (página 1 sola) deja hasNextPage=true con sort no-predeterminado activo.
        initialLoadDoneRef.current = false;
        void queryClient.invalidateQueries({ queryKey: ['my-games'] });
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [user?.id, queryClient]);

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
    isFetching,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    dataUpdatedAt,
  } = useMyGames(platform);

  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  // Carga todas las páginas restantes — necesario para que el sort client-side sea completo
  const fetchAllRemainingPages = useCallback(async () => {
    if (!hasNextPage) return;
    // Usar el resultado de cada fetchNextPage (no el closure de hasNextPage — puede ser stale)
    let result = await fetchNextPage();
    while (result.hasNextPage) {
      result = await fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage]);

  // Ref que marca si la carga inicial de todas las páginas ya fue completada
  // para el sort activo en el momento del montaje. Se resetea al cambiar el sort o al refrescar.
  const initialLoadDoneRef = useRef(false);

  const handleRefresh = useCallback(async () => {
    initialLoadDoneRef.current = false;
    setIsManualRefreshing(true);
    try {
      // resetQueries elimina el caché y recarga solo la primera página.
      // Cargar todas las páginas a continuación para que el sort sea correcto sobre el set completo,
      // independientemente del sort activo (incluido last_played — BUG-1).
      await Promise.all([
        queryClient.resetQueries({ queryKey: ['my-games'] }),
        queryClient.invalidateQueries({ queryKey: ['sync-summary'] }),
      ]);
      await fetchAllRemainingPages();
    } finally {
      setIsManualRefreshing(false);
    }
  }, [queryClient, fetchAllRemainingPages]);

  // Carga todas las páginas pendientes al montar para que el sort client-side sea correcto
  // sobre el set completo de juegos, independientemente del sort activo (incluido last_played).
  // BUG-1: el early return para 'last_played' dejaba solo la página 1 cargada, lo que hacía
  // que la ordenación operara solo sobre un subset y mostrara resultados incorrectos.
  useEffect(() => {
    if (initialLoadDoneRef.current) return;

    if (!isLoading && !isFetchingNextPage && hasNextPage) {
      initialLoadDoneRef.current = true;
      void fetchAllRemainingPages();
      return;
    }

    if (allGames.length > 0 && hasNextPage && !isFetchingNextPage) {
      initialLoadDoneRef.current = true;
      void fetchAllRemainingPages();
    }
  }, [allGames.length, isLoading, isFetchingNextPage, hasNextPage, librarySortOrder, fetchAllRemainingPages]);

  // Al cambiar el sort, carga todas las páginas pendientes para que la ordenación sea completa
  const handleSortChange = useCallback(
    async (newSort: LibrarySortOrder) => {
      initialLoadDoneRef.current = false;
      setLibrarySortOrder(newSort);
      if (hasNextPage) {
        await fetchAllRemainingPages();
      }
    },
    [hasNextPage, setLibrarySortOrder, fetchAllRemainingPages],
  );

  // useSyncAll se consume en SyncStatusBar internamente

  const games = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? allGames.filter((g) => g.title.toLowerCase().includes(q))
      : allGames;
    // Ordenación cliente-side — no afecta a la paginación del backend
    return sortGames(filtered, librarySortOrder ?? 'last_played', isRunning);
  }, [allGames, search, librarySortOrder, isRunning]);

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
    <SafeAreaView className="flex-1 bg-surface" edges={['left', 'right']}>
      {/* Cabecera */}
      <View className="px-4 pt-1 pb-2 flex-row items-center justify-between">
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
        </View>
      </View>

      {/* Barra de sync — botón manual, última sync, próximo auto sync, syncs restantes */}
      {!isLoading && !isError && totalGames > 0 && <SyncStatusBar />}

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
          disabled={isFetchingNextPage}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
          className="bg-surface-2 px-3 rounded-xl"
          accessibilityRole="button"
          accessibilityLabel={t('library.sort_button_a11y', { current: activeSortLabel })}
          accessibilityState={{ busy: isFetchingNextPage }}
        >
          {isFetchingNextPage ? (
            <ActivityIndicator size="small" color="#818cf8" testID="sort-loading-indicator" />
          ) : (
            <Text className="text-primary-light text-xs font-semibold" numberOfLines={1}>
              {activeSortLabel} ▼
            </Text>
          )}
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
        <View style={{ flex: 1 }}>
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
                refreshing={isManualRefreshing}
                onRefresh={() => { void handleRefresh(); }}
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
              ) : isFetching ? (
                // Refetch en curso (por invalidación tras desvincular, pull-to-refresh, etc.)
                // — no mostrar el empty state todavía para evitar el flash de "Tus juegos
                // aparecerán pronto" cuando el refetch de my-games termina antes que el de sync-summary.
                <LibrarySkeleton />
              ) : anyPlatformLinked ? (
                // Usuario ya tiene plataformas vinculadas pero sin juegos (sync aún no corrió)
                <EmptyState
                  emoji="⏳"
                  title={t('library.empty_linked_title')}
                  body={t('library.empty_linked_body')}
                />
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
        </View>
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
                    setSortModalVisible(false);
                    void handleSortChange(key);
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
