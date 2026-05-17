import { Pressable, View, Text } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { GameSearchResult } from '@unlockhub/types';

const PLATFORM_LABEL: Record<string, string> = {
  STEAM: 'Steam',
  RA: 'RetroAchievements',
  XBOX: 'Xbox',
  PSN: 'PlayStation',
};

const PLATFORM_COLOR: Record<string, string> = {
  STEAM: '#1b9aaa',
  RA: '#e8a838',
  XBOX: '#107c10',
  PSN: '#003087',
};

interface Props {
  game: GameSearchResult;
}

export function GameCard({ game }: Props) {
  const { t } = useTranslation();
  const platformLabel = PLATFORM_LABEL[game.platform] ?? game.platform;
  const platformColor = PLATFORM_COLOR[game.platform] ?? '#6b7280';

  return (
    <Pressable
      onPress={() => router.push(`/game/${game.id}`)}
      className="flex-row items-center px-4 py-3 bg-surface-card rounded-xl mb-2 active:opacity-70"
      accessibilityRole="button"
      accessibilityLabel={t('search.game_item_label', {
        title: game.title,
        platform: platformLabel,
        count: game.totalAchievements,
      })}
    >
      <Image
        source={game.iconUrl ?? require('../assets/images/icon.png')}
        style={{ width: 48, height: 48, borderRadius: 8 }}
        contentFit="cover"
        accessibilityElementsHidden
      />
      <View className="flex-1 ml-3">
        <Text className="text-white font-semibold text-sm" numberOfLines={1}>
          {game.title}
        </Text>
        <Text className="text-gray-400 text-xs mt-0.5">
          {t('search.achievements_count', { count: game.totalAchievements })}
          {game.console ? ` · ${game.console}` : ''}
        </Text>
      </View>
      <View
        className="px-2 py-0.5 rounded-full ml-2"
        style={{ backgroundColor: platformColor + '33' }}
        importantForAccessibility="no"
      >
        <Text className="text-xs font-medium" style={{ color: platformColor }}>
          {platformLabel}
        </Text>
      </View>
    </Pressable>
  );
}
