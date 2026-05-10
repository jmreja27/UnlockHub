import { useCallback, useState } from 'react';
import { View, Text, RefreshControl, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';

import { useGlobalRankings, useCountryRanking, usePlatformRanking, useMyRanking } from '../../hooks/useRankings';
import { useSessionStore } from '../../stores/sessionStore';
import { RankingItem } from '../../components/RankingItem';
import { SkeletonBox } from '../../components/SkeletonBox';
import { AdBanner } from '../../components/AdBanner';
import type { RankingEntry } from '@unlockhub/types';

type RankingFilter = 'global' | 'national' | 'STEAM' | 'RA' | 'PSN';

const FILTERS: { key: RankingFilter; labelKey: string }[] = [
  { key: 'global',   labelKey: 'rankings.filter_global' },
  { key: 'national', labelKey: 'rankings.filter_national' },
  { key: 'STEAM',    labelKey: 'rankings.filter_steam' },
  { key: 'RA',       labelKey: 'rankings.filter_ra' },
  { key: 'PSN',      labelKey: 'rankings.filter_psn' },
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
  countryCode,
  currentUserId,
  onPressUser,
}: {
  filter: RankingFilter;
  countryCode: string | null;
  currentUserId: string | undefined;
  onPressUser: (username: string) => void;
}) {
  const { t } = useTranslation();

  const globalQuery = useGlobalRankings(1, 50);
  const countryQuery = useCountryRanking(countryCode ?? '', 1, 50);
  const platformQuery = usePlatformRanking(
    filter !== 'global' && filter !== 'national' ? filter : '',
    1,
    50,
  );

  const query =
    filter === 'global' ? globalQuery
    : filter === 'national' ? countryQuery
    : platformQuery;

  const { data, isLoading, isError, refetch, isRefetching } = query;

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

  if (filter === 'national' && !countryCode) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-gray-400 text-center text-base">
          {t('rankings.national_no_country')}
        </Text>
      </View>
    );
  }

  if (isLoading) return <RankingSkeletonList />;

  if (isError) {
    return (
      <View
        className="flex-1 items-center justify-center px-6"
        accessible
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <Text className="text-red-400 text-lg font-semibold mb-2">{t('rankings.error_title')}</Text>
        <Text className="text-gray-400 text-sm text-center mb-6">{t('rankings.error_message')}</Text>
        <Text
          className="text-primary-light text-base"
          onPress={() => void refetch()}
          accessibilityRole="button"
          accessibilityLabel={t('rankings.retry_label')}
        >
          {t('common.retry')}
        </Text>
      </View>
    );
  }

  return (
    <FlashList
      data={data?.data ?? []}
      renderItem={renderItem}
      keyExtractor={(item) => item.userId}
      estimatedItemSize={68}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
      accessibilityLabel={t('rankings.list_label')}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          tintColor="#818cf8"
          colors={['#4f46e5']}
          accessibilityLabel={t('rankings.refresh_label')}
        />
      }
      ListEmptyComponent={
        <View className="items-center justify-center py-8" accessible accessibilityLiveRegion="polite">
          <Text className="text-gray-400 text-base text-center">{t('rankings.empty')}</Text>
        </View>
      }
      ListFooterComponent={<AdBanner />}
    />
  );
}

export default function RankingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useSessionStore();
  const [activeFilter, setActiveFilter] = useState<RankingFilter>('global');

  const { data: myRanking } = useMyRanking();

  const handlePressUser = useCallback(
    (username: string) => {
      router.push(`/profile/${username}`);
    },
    [router],
  );

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="px-4 pt-4 pb-2">
        <Text className="text-white text-2xl font-bold" accessibilityRole="header">
          {t('rankings.title')}
        </Text>
      </View>

      {/* Filtros horizontales */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}
        accessibilityRole="tablist"
        accessibilityLabel={t('rankings.filter_label')}
      >
        {FILTERS.map(({ key, labelKey }) => (
          <Pressable
            key={key}
            onPress={() => setActiveFilter(key)}
            className={`px-4 py-2 rounded-full ${activeFilter === key ? 'bg-primary' : 'bg-surface-2'}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeFilter === key }}
            accessibilityLabel={t(labelKey)}
          >
            <Text className={`font-semibold text-sm ${activeFilter === key ? 'text-white' : 'text-gray-400'}`}>
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
              ? t('rankings.my_position_aria', { rank: myRanking.rank, xp: myRanking.xp.toLocaleString() })
              : t('rankings.my_position_unranked_aria', { xp: myRanking.xp.toLocaleString() })
          }
        >
          <Text className="text-gray-400 text-xs mb-1">{t('rankings.my_position_label')}</Text>
          <View className="flex-row items-center justify-between">
            <Text className="text-primary-light font-bold text-lg">
              {myRanking.rank ? `#${myRanking.rank}` : '—'}
            </Text>
            <Text className="text-white font-semibold">
              {myRanking.xp.toLocaleString()} XP
            </Text>
          </View>
        </View>
      )}

      <RankingList
        filter={activeFilter}
        countryCode={user?.countryCode ?? null}
        currentUserId={user?.id}
        onPressUser={handlePressUser}
      />
    </SafeAreaView>
  );
}
