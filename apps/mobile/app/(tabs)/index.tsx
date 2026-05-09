import { useCallback, useState } from 'react';
import { View, Text, RefreshControl, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';

import { useMyGames } from '../../hooks/useMyGames';
import { useSessionStore } from '../../stores/sessionStore';
import { LibraryGameCard } from '../../components/LibraryGameCard';
import { SkeletonBox } from '../../components/SkeletonBox';
import { AdBanner } from '../../components/AdBanner';
import type { LibraryGame } from '../../hooks/useMyGames';

type PlatformFilter = 'ALL' | 'STEAM' | 'RA' | 'PSN' | 'XBOX';

const FILTERS: { key: PlatformFilter; label: string }[] = [
  { key: 'ALL',   label: 'library.filter_all' },
  { key: 'STEAM', label: 'library.filter_steam' },
  { key: 'RA',    label: 'library.filter_ra' },
  { key: 'PSN',   label: 'library.filter_psn' },
  { key: 'XBOX',  label: 'library.filter_xbox' },
];

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

export default function LibraryScreen() {
  const { t } = useTranslation();
  const { user } = useSessionStore();
  const [activeFilter, setActiveFilter] = useState<PlatformFilter>('ALL');

  const platform = activeFilter === 'ALL' ? undefined : activeFilter;
  const { data, isLoading, isError, refetch, isRefetching } = useMyGames(platform);

  const games = data?.data ?? [];

  const totalEarned = games.reduce((sum, g) => sum + g.earnedAchievements, 0);
  const totalAchievements = games.reduce((sum, g) => sum + g.totalAchievements, 0);

  const renderItem = useCallback(
    ({ item }: { item: LibraryGame }) => <LibraryGameCard game={item} />,
    [],
  );

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Cabecera */}
      <View className="px-4 pt-4 pb-2 flex-row items-baseline justify-between">
        <View>
          <Text className="text-white text-2xl font-bold" accessibilityRole="header">
            {t('library.title')}
          </Text>
          {user && (
            <Text className="text-gray-400 text-sm mt-0.5">
              {t('library.subtitle', { username: user.username })}
            </Text>
          )}
        </View>
        {!isLoading && !isError && games.length > 0 && (
          <View className="items-end">
            <Text className="text-primary-light font-bold text-base">{totalEarned}</Text>
            <Text className="text-gray-500 text-xs">/ {totalAchievements} logros</Text>
          </View>
        )}
      </View>

      {/* Filtros por plataforma */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}
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
            <View className="items-center justify-center py-20" accessible accessibilityLiveRegion="polite">
              <Text className="text-gray-400 text-base text-center">{t('library.empty')}</Text>
            </View>
          }
          ListFooterComponent={<AdBanner />}
        />
      )}
    </SafeAreaView>
  );
}
