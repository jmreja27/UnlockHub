import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import type { GameSearchResult, UserSearchResult, AchievementSearchResult } from '@unlockhub/types';
import { useState } from 'react';

import { useSearch, type SearchFilter } from '../../hooks/useSearch';
import { useSearchAchievements, type AchievementPlatformFilter } from '../../hooks/useSearchAchievements';
import { GameCard } from '../../components/GameCard';
import { UserCard } from '../../components/UserCard';
import { AchievementSearchCard } from '../../components/AchievementSearchCard';
import { SkeletonBox } from '../../components/SkeletonBox';
import { AdBanner } from '../../components/AdBanner';

type FullSearchFilter = SearchFilter | 'achievements';

type FilterOption = { key: FullSearchFilter; labelKey: string };
type PlatformFilterOption = { key: AchievementPlatformFilter; labelKey: string };

const FILTERS: FilterOption[] = [
  { key: 'all', labelKey: 'search.filter_all' },
  { key: 'games', labelKey: 'search.filter_games' },
  { key: 'achievements', labelKey: 'search.filter_achievements' },
  { key: 'users', labelKey: 'search.filter_users' },
];

const PLATFORM_FILTERS: PlatformFilterOption[] = [
  { key: 'all', labelKey: 'search.platform_filter_all' },
  { key: 'STEAM', labelKey: 'search.platform_filter_steam' },
  { key: 'RA', labelKey: 'search.platform_filter_ra' },
  { key: 'PSN', labelKey: 'search.platform_filter_psn' },
];

type ListItem =
  | { kind: 'game'; data: GameSearchResult }
  | { kind: 'user'; data: UserSearchResult }
  | { kind: 'achievement'; data: AchievementSearchResult }
  | { kind: 'section'; title: string }
  | { kind: 'empty'; message: string };

export default function SearchScreen() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<FullSearchFilter>('all');
  const [platformFilter, setPlatformFilter] = useState<AchievementPlatformFilter>('all');

  // Búsqueda de juegos/usuarios — solo activa cuando filter !== 'achievements'
  const gameUserSearch = useSearch(
    (filter === 'achievements' ? 'all' : filter) as SearchFilter,
  );

  // Búsqueda de logros — solo activa cuando filter === 'achievements'
  const achievementSearch = useSearchAchievements(platformFilter);

  // Sincronizar la query entre los dos hooks
  const query = filter === 'achievements' ? achievementSearch.query : gameUserSearch.query;
  const setQuery = (q: string) => {
    gameUserSearch.setQuery(q);
    achievementSearch.setQuery(q);
  };

  const isFetching =
    filter === 'achievements' ? achievementSearch.isFetching : gameUserSearch.isFetching;
  const enabled =
    filter === 'achievements' ? achievementSearch.enabled : gameUserSearch.enabled;

  const items: ListItem[] = buildItems(
    filter,
    gameUserSearch.data,
    achievementSearch.achievements,
    achievementSearch.debouncedQuery,
    enabled,
    t,
  );

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Barra de búsqueda */}
      <View className="px-4 pt-1 pb-3">
        <Text className="text-white text-2xl font-bold mb-2" accessibilityRole="header">
          {t('search.title')}
        </Text>
        <View className="flex-row items-center bg-surface-card rounded-xl px-3 h-11">
          <Text className="text-gray-400 mr-2 text-base" accessibilityElementsHidden>🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('search.placeholder')}
            placeholderTextColor="#6b7280"
            className="flex-1 text-white text-sm"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={t('search.input_label')}
            accessibilityRole="search"
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('search.clear_label')}
            >
              <Text className="text-gray-400 text-base">✕</Text>
            </Pressable>
          )}
        </View>

        {/* Filtros principales */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingVertical: 8 }}
          style={{ flexGrow: 0 }}
        >
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              className={`px-4 py-1.5 rounded-full border ${
                filter === f.key
                  ? 'bg-primary border-primary'
                  : 'border-surface-card bg-transparent'
              }`}
              accessibilityRole="radio"
              accessibilityState={{ checked: filter === f.key }}
              accessibilityLabel={t(f.labelKey)}
            >
              <Text
                className={`text-xs font-medium ${
                  filter === f.key ? 'text-white' : 'text-gray-400'
                }`}
              >
                {t(f.labelKey)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <AdBanner unitId="search" />

        {/* Sub-filtro de plataforma — solo visible cuando filter=achievements */}
        {filter === 'achievements' && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingBottom: 2 }}
            style={{ flexGrow: 0 }}
          >
            {PLATFORM_FILTERS.map((pf) => (
              <Pressable
                key={pf.key}
                onPress={() => setPlatformFilter(pf.key)}
                className={`px-3 py-1 rounded-full border ${
                  platformFilter === pf.key
                    ? 'bg-primary/20 border-primary'
                    : 'border-gray-700 bg-transparent'
                }`}
                accessibilityRole="radio"
                accessibilityState={{ checked: platformFilter === pf.key }}
                accessibilityLabel={t(pf.labelKey)}
              >
                <Text
                  className={`text-xs ${
                    platformFilter === pf.key ? 'text-primary-light' : 'text-gray-500'
                  }`}
                >
                  {t(pf.labelKey)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Resultados */}
      {isFetching && enabled ? (
        <View className="px-4">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBox key={i} className="h-16 rounded-xl mb-2" />
          ))}
        </View>
      ) : (
        <FlashList
          data={items}
          keyExtractor={(item, i) => {
            if (item.kind === 'game') return `g-${item.data.id}`;
            if (item.kind === 'user') return `u-${item.data.id}`;
            if (item.kind === 'achievement') return `a-${item.data.id}`;
            return `s-${i}`;
          }}
          renderItem={({ item }) => {
            if (item.kind === 'game')
              return (
                <View className="px-4">
                  <GameCard game={item.data} />
                </View>
              );
            if (item.kind === 'user')
              return (
                <View className="px-4">
                  <UserCard user={item.data} />
                </View>
              );
            if (item.kind === 'achievement')
              return (
                <View className="px-4">
                  <AchievementSearchCard achievement={item.data} />
                </View>
              );
            if (item.kind === 'section')
              return (
                <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider px-4 mb-2 mt-4">
                  {item.title}
                </Text>
              );
            return (
              <Text className="text-gray-500 text-sm text-center mt-8 px-8">
                {item.message}
              </Text>
            );
          }}
          estimatedItemSize={72}
          contentContainerStyle={{ paddingBottom: 24 }}
          onEndReached={() => {
            if (
              filter === 'achievements' &&
              achievementSearch.hasNextPage &&
              !achievementSearch.isFetchingNextPage
            ) {
              void achievementSearch.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.3}
        />
      )}
    </SafeAreaView>
  );
}

function buildItems(
  filter: FullSearchFilter,
  gameUserData: { games: GameSearchResult[]; users: UserSearchResult[] } | undefined,
  achievements: AchievementSearchResult[],
  debouncedQuery: string,
  enabled: boolean,
  t: (k: string, opts?: Record<string, unknown>) => string,
): ListItem[] {
  if (!enabled) return [{ kind: 'empty', message: t('search.hint') }];

  const items: ListItem[] = [];

  if (filter === 'achievements') {
    if (achievements.length > 0) {
      achievements.forEach((a) => items.push({ kind: 'achievement', data: a }));
    } else if (debouncedQuery.length >= 2) {
      items.push({
        kind: 'empty',
        message: t('search.achievements_empty', { query: debouncedQuery }),
      });
    }
    return items;
  }

  // Filtros games / users / all
  if (!gameUserData) return [];

  if (filter !== 'users' && gameUserData.games.length > 0) {
    if (filter === 'all') items.push({ kind: 'section', title: t('search.section_games') });
    gameUserData.games.forEach((g) => items.push({ kind: 'game', data: g }));
  }

  if (filter !== 'games' && gameUserData.users.length > 0) {
    if (filter === 'all') items.push({ kind: 'section', title: t('search.section_users') });
    gameUserData.users.forEach((u) => items.push({ kind: 'user', data: u }));
  }

  if (items.length === 0) {
    items.push({ kind: 'empty', message: t('search.no_results') });
  }

  return items;
}
