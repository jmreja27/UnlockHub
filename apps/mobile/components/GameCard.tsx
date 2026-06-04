import { Pressable, View, Text } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { GameSearchResult } from '@unlockhub/types';

import { getPlatformColor } from '../lib/platformColors';

const PLATFORM_LABEL: Record<string, string> = {
  STEAM: 'Steam',
  RA: 'RetroAchievements',
  XBOX: 'Xbox',
  PSN: 'PlayStation',
};

interface Props {
  game: GameSearchResult;
}

export function GameCard({ game }: Props) {
  const { t } = useTranslation();
  const platformLabel = PLATFORM_LABEL[game.platform] ?? game.platform;
  const platformColor = getPlatformColor(game.platform);

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
        {(game.totalAchievements > 0 || game.console) && (
          <Text className="text-gray-400 text-xs mt-0.5">
            {game.totalAchievements > 0
              ? t('search.achievements_count', { count: game.totalAchievements })
              : null}
            {game.totalAchievements > 0 && game.console ? ' · ' : null}
            {game.console ?? null}
          </Text>
        )}
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
