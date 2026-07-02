import { useCallback, useState } from 'react';
import { View, Text, RefreshControl, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { RankingEntry } from '@unlockhub/types';

import { useGlobalRankings, usePlatformRanking, useMyRanking } from '../../hooks/useRankings';
import { useSessionStore } from '../../stores/sessionStore';
import { ApiRequestError } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import { RankingItem } from '../../components/RankingItem';
import { SkeletonBox } from '../../components/SkeletonBox';
import { AdBanner } from '../../components/AdBanner';
import { useTheme } from '../../hooks/useTheme';
import { formatNumber } from '../../lib/formatTimeAgo';

type RankingFilter = 'global' | 'STEAM' | 'RA' | 'PSN';

function classifyError(err: Error | null): 'network' | 'auth' | 'server' {
  if (!err) return 'server';
  if (err instanceof ApiRequestError) {
    if (err.statusCode === 401 || err.statusCode === 403) return 'auth';
    if (err.statusCode >= 500) return 'server';
  }
  if (err.message.toLowerCase().includes('fetch') || err.message.toLowerCase().includes('network')) return 'network';
  return 'server';
}

const FILTERS: { key: RankingFilter; labelKey: string }[] = [
  { key: 'global', labelKey: 'rankings.filter_global' },
  { key: 'STEAM',  labelKey: 'rankings.filter_steam' },
  { key: 'RA',     labelKey: 'rankings.filter_ra' },
  { key: 'PSN',    labelKey: 'rankings.filter_psn' },
];

const SKELETON_COUNT = 10;

function RankingSkeletonList() {
  return (
    <View className="px-4 pt-4">
      {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
        <View
          key={index}
          className="flex-row items-center bg-surface-elevated rounded-xl px-4 py-3 mb-2"
          style={{ minHeight: 60 }}
          accessible={false}
          accessibilityElementsHidden
        >
          <SkeletonBox width={28} height={20} borderRadius={4} style={{ marginRight: 12 }} />
          <SkeletonBox width={40} height={40} borderRadius={20} style={{ marginRight: 12 }} />
          <View className="flex-1">
            <SkeletonBox width={120} height={16} borderRadius={4} style={{ marginBottom: 6 }} />
            <SkeletonBox width={60} height={12} borderRadius={4} />
          </View>
          <SkeletonBox width={50} height={16} borderRadius={4} />
        </View>
      ))}
    </View>
  );
}

function RankingList({
  filter,
  currentUserId,
  onPressUser,
}: {
  filter: RankingFilter;
  currentUserId: string | undefined;
  onPressUser: (username: string) => void;
}) {
  const { t } = useTranslation();
  const colors = useTheme();
  const queryClient = useQueryClient();
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const globalQuery = useGlobalRankings(1, 50);
  const platformQuery = usePlatformRanking(filter !== 'global' ? filter : '', 1, 50);

  const query = filter === 'global' ? globalQuery : platformQuery;

  const { data, isLoading, isError, error, refetch } = query;

  async function handleRefresh(): Promise<void> {
    setIsManualRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.rankings() });
    } finally {
      setIsManualRefreshing(false);
    }
  }

  const renderItem = useCallback(
    ({ item }: { item: RankingEntry }) => (
      <RankingItem
        entry={item}
        isCurrentUser={currentUserId === item.userId}
        onPress={() => onPressUser(item.username)}
      />
    ),
    [currentUserId, onPressUser],
  );

  if (isLoading) return <RankingSkeletonList />;

  if (isError) {
    const errorType = classifyError(error);
    return (
      <View
        className="flex-1 items-center justify-center px-6"
        accessible
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <Text className="text-red-400 text-lg font-semibold mb-2">{t('rankings.error_title')}</Text>
        <Text className="text-sm text-center mb-6" style={{ color: colors.textSecondary }}>
          {errorType === 'network'
            ? t('rankings.error_network')
            : errorType === 'auth'
              ? t('rankings.error_auth')
              : t('rankings.error_server')}
        </Text>
        {errorType !== 'auth' && (
          <Text
            className="text-primary-light text-base"
            onPress={() => void refetch()}
            accessibilityRole="button"
            accessibilityLabel={t('rankings.retry_label')}
          >
            {t('common.retry')}
          </Text>
        )}
      </View>
    );
  }

  return (
    <FlashList
      data={data?.data ?? []}
      renderItem={renderItem}
      keyExtractor={(item) => item.userId}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
      accessibilityLabel={t('rankings.list_label')}
      refreshControl={
        <RefreshControl
          refreshing={isManualRefreshing}
          onRefresh={() => void handleRefresh()}
          tintColor="#818cf8"
          colors={['#4f46e5']}
          accessibilityLabel={t('rankings.refresh_label')}
        />
      }
      ListEmptyComponent={
        <View className="items-center justify-center py-8" accessible accessibilityLiveRegion="polite">
          <Text className="text-base text-center" style={{ color: colors.textSecondary }}>{t('rankings.empty')}</Text>
        </View>
      }
      ListFooterComponent={<View className="h-4" />}
    />
  );
}

export default function RankingsScreen() {
  const { t, i18n } = useTranslation();
  const colors = useTheme();
  const router = useRouter();
  const { user } = useSessionStore();
  const [activeFilter, setActiveFilter] = useState<RankingFilter>('global');

  // Pasar el filtro activo para que "Mi posición" muestre XP del mismo sorted set que la lista.
  // Sin filtro ('global') → XP total; con filtro ('STEAM'/'RA'/'PSN') → XP específico de plataforma.
  const { data: myRanking } = useMyRanking(activeFilter !== 'global' ? activeFilter : undefined);

  const handlePressUser = useCallback(
    (username: string) => {
      router.push(`/profile/${username}`);
    },
    [router],
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={['left', 'right']}>
      <View className="px-4 pt-1 pb-2">
        <Text className="text-2xl font-bold" style={{ color: colors.text }} accessibilityRole="header">
          {t('rankings.title')}
        </Text>
      </View>

      {/* Filtros horizontales */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: 'center' }}
        accessibilityRole="tablist"
        accessibilityLabel={t('rankings.filter_label')}
      >
        {FILTERS.map(({ key, labelKey }) => (
          <Pressable
            key={key}
            onPress={() => setActiveFilter(key)}
            className="px-4 py-2 rounded-full"
            style={{ backgroundColor: activeFilter === key ? colors.primary : colors.surface }}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeFilter === key }}
            accessibilityLabel={t(labelKey)}
          >
            <Text className="font-semibold text-sm" style={{ color: activeFilter === key ? '#ffffff' : colors.textSecondary }}>
              {t(labelKey)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Mi posición */}
      {user && myRanking && (
        <View
          className="mx-4 mb-3 bg-primary/20 border border-primary/40 rounded-xl px-4 py-3"
          accessible
          accessibilityLabel={
            myRanking.rank
              ? t('rankings.my_position_aria', { rank: myRanking.rank, xp: formatNumber(myRanking.xp ?? 0, i18n.language) })
              : t('rankings.my_position_unranked_aria', { xp: formatNumber(myRanking.xp ?? 0, i18n.language) })
          }
        >
          <Text className="text-xs mb-1" style={{ color: colors.textSecondary }}>{t('rankings.my_position_label')}</Text>
          <View className="flex-row items-center justify-between">
            <Text className="text-primary-light font-bold text-lg">
              {myRanking.rank ? `#${myRanking.rank}` : '—'}
            </Text>
            <Text className="font-semibold" style={{ color: colors.text }}>
              {formatNumber(myRanking.xp ?? 0, i18n.language)} XP
            </Text>
          </View>
        </View>
      )}

      <AdBanner unitId="rankings" />

      <RankingList
        filter={activeFilter}
        currentUserId={user?.id}
        onPressUser={handlePressUser}
      />
    </SafeAreaView>
  );
}
