import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import type { GameSearchResult, UserSearchResult } from '@unlockhub/types';
import { useState } from 'react';

import { useSearch, type SearchFilter } from '../../hooks/useSearch';
import { GameCard } from '../../components/GameCard';
import { UserCard } from '../../components/UserCard';
import { SkeletonBox } from '../../components/SkeletonBox';
import { AdBanner } from '../../components/AdBanner';
import { useTheme } from '../../hooks/useTheme';

type FilterOption = { key: SearchFilter; labelKey: string };

const FILTERS: FilterOption[] = [
  { key: 'all', labelKey: 'search.filter_all' },
  { key: 'games', labelKey: 'search.filter_games' },
  { key: 'users', labelKey: 'search.filter_users' },
];

type ListItem =
  | { kind: 'game'; data: GameSearchResult }
  | { kind: 'user'; data: UserSearchResult }
  | { kind: 'section'; title: string }
  | { kind: 'empty'; message: string };

export default function SearchScreen() {
  const { t } = useTranslation();
  const colors = useTheme();
  const [filter, setFilter] = useState<SearchFilter>('all');

  const { query, setQuery, data, isFetching, enabled } = useSearch(filter);

  const items: ListItem[] = buildItems(filter, data, enabled, t);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={['left', 'right']}>
      {/* Barra de búsqueda */}
      <View className="px-4 pt-1 pb-3">
        <Text className="text-2xl font-bold mb-2" style={{ color: colors.text }} accessibilityRole="header">
          {t('search.title')}
        </Text>
        <View className="flex-row items-center rounded-xl px-3 h-11" style={{ backgroundColor: colors.surfaceCard }}>
          <Text className="mr-2 text-base" style={{ color: colors.textSecondary }} accessibilityElementsHidden>🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('search.placeholder')}
            placeholderTextColor={colors.textMuted}
            className="flex-1 text-sm"
            style={{ color: colors.text }}
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
              <Text className="text-base" style={{ color: colors.textSecondary }}>✕</Text>
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
              className="px-4 py-1.5 rounded-full"
              style={{
                backgroundColor: filter === f.key ? colors.primary : 'transparent',
                borderWidth: 1,
                borderColor: filter === f.key ? colors.primary : colors.border,
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: filter === f.key }}
              accessibilityLabel={t(f.labelKey)}
            >
              <Text
                className="text-xs font-medium"
                style={{ color: filter === f.key ? '#ffffff' : colors.textSecondary }}
              >
                {t(f.labelKey)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <AdBanner unitId="search" />
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
            if (item.kind === 'section')
              return (
                <Text className="text-xs font-semibold uppercase tracking-wider px-4 mb-2 mt-4" style={{ color: colors.textSecondary }}>
                  {item.title}
                </Text>
              );
            return (
              <Text className="text-sm text-center mt-8 px-8" style={{ color: colors.textMuted }}>
                {item.message}
              </Text>
            );
          }}
          contentContainerStyle={{ paddingBottom: 24 }}
          onEndReachedThreshold={0.3}
        />
      )}
    </SafeAreaView>
  );
}

function buildItems(
  filter: SearchFilter,
  gameUserData: { games: GameSearchResult[]; users: UserSearchResult[] } | undefined,
  enabled: boolean,
  t: (k: string, opts?: Record<string, unknown>) => string,
): ListItem[] {
  if (!enabled) return [{ kind: 'empty', message: t('search.hint') }];

  const items: ListItem[] = [];

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
