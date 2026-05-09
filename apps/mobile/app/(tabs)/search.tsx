import { View, Text, TextInput, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { useSearch, type SearchFilter } from '../../hooks/useSearch';
import { GameCard } from '../../components/GameCard';
import { UserCard } from '../../components/UserCard';
import { SkeletonBox } from '../../components/SkeletonBox';
import type { GameSearchResult, UserSearchResult } from '@unlockhub/types';

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
  const [filter, setFilter] = useState<SearchFilter>('all');
  const { query, setQuery, debouncedQuery, enabled, data, isFetching } = useSearch(filter);

  const items: ListItem[] = buildItems(data, filter, debouncedQuery, enabled, t);

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Barra de búsqueda */}
      <View className="px-4 pt-4 pb-3">
        <Text className="text-white text-2xl font-bold mb-4" accessibilityRole="header">
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

        {/* Filtros */}
        <View className="flex-row mt-3 gap-2">
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
        </View>
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
          keyExtractor={(item, i) =>
            item.kind === 'game'
              ? `g-${item.data.id}`
              : item.kind === 'user'
              ? `u-${item.data.id}`
              : `s-${i}`
          }
          renderItem={({ item }) => {
            if (item.kind === 'game') return <View className="px-4"><GameCard game={item.data} /></View>;
            if (item.kind === 'user') return <View className="px-4"><UserCard user={item.data} /></View>;
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
        />
      )}
    </SafeAreaView>
  );
}

function buildItems(
  data: { games: GameSearchResult[]; users: UserSearchResult[] } | undefined,
  filter: SearchFilter,
  query: string,
  enabled: boolean,
  t: (k: string) => string,
): ListItem[] {
  if (!enabled) return [{ kind: 'empty', message: t('search.hint') }];
  if (!data) return [];

  const items: ListItem[] = [];

  if (filter !== 'users' && data.games.length > 0) {
    if (filter === 'all') items.push({ kind: 'section', title: t('search.section_games') });
    data.games.forEach((g) => items.push({ kind: 'game', data: g }));
  }

  if (filter !== 'games' && data.users.length > 0) {
    if (filter === 'all') items.push({ kind: 'section', title: t('search.section_users') });
    data.users.forEach((u) => items.push({ kind: 'user', data: u }));
  }

  if (items.length === 0) {
    items.push({ kind: 'empty', message: t('search.no_results') });
  }

  return items;
}

// Import diferido para evitar error de orden
import { useState } from 'react';
