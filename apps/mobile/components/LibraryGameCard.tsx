import { Pressable, View, Text } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { LibraryGame } from '../hooks/useMyGames';
import { getPlatformColor } from '../lib/platformColors';

const PLATFORM_LABEL: Record<string, string> = {
  STEAM: 'Steam',
  RA: 'RetroAchievements',
  XBOX: 'Xbox',
  PSN: 'PlayStation',
};

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <View className="h-1.5 bg-surface rounded-full overflow-hidden mt-1.5" accessibilityElementsHidden>
      <View style={{ width: `${pct}%`, backgroundColor: color, height: '100%', borderRadius: 9999 }} />
    </View>
  );
}

interface Props {
  game: LibraryGame;
}

export function LibraryGameCard({ game }: Props) {
  const { t } = useTranslation();
  const platformLabel = PLATFORM_LABEL[game.platform] ?? game.platform;
  const platformColor = getPlatformColor(game.platform);

  // Color y estado de completado
  let barColor: string;
  let pctLabel: string;

  if (game.isCompleted) {
    barColor = '#22c55e';
    pctLabel = t('library.complete');
  } else {
    barColor = platformColor;
    pctLabel = `${game.completionPct}%`;
  }

  return (
    <Pressable
      onPress={() => router.push(`/game/${game.id}`)}
      className="bg-surface-card rounded-xl mb-2 px-4 py-3 active:opacity-70"
      accessibilityRole="button"
      accessibilityLabel={t('library.game_label', {
        title: game.title,
        earned: game.earnedAchievements,
        total: game.totalAchievements,
        pct: game.completionPct,
      })}
    >
      <View className="flex-row items-center">
        <Image
          source={game.iconUrl ?? require('../assets/images/icon.png')}
          style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: '#1e293b' }}
          contentFit="contain"
          accessibilityElementsHidden
        />
        <View className="flex-1 ml-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-white font-semibold text-sm flex-1 mr-2" numberOfLines={1}>
              {game.title}
            </Text>
            <View className="flex-row items-center gap-1.5">
              {/* Badge Platino — solo cuando el juego PSN tiene el platino desbloqueado */}
              {game.platform === 'PSN' && game.platinumEarned && (
                <View
                  className="bg-yellow-400 rounded px-1"
                  importantForAccessibility="no"
                >
                  <Text className="text-xs font-bold text-black">
                    {t('library.psn_platinum_badge')}
                  </Text>
                </View>
              )}
              <View
                className="px-2 py-0.5 rounded-full"
                style={{ backgroundColor: platformColor + '33' }}
                importantForAccessibility="no"
              >
                <Text className="text-xs font-medium" style={{ color: platformColor }}>
                  {platformLabel}
                </Text>
              </View>
            </View>
          </View>

          <View className="flex-row items-center justify-between mt-0.5">
            <Text className="text-gray-400 text-xs">
              {game.earnedAchievements}/{game.totalAchievements} {t('library.achievements_short')}
            </Text>
            <Text
              className="text-xs font-semibold"
              style={{ color: game.isCompleted ? '#22c55e' : platformColor }}
            >
              {pctLabel}
            </Text>
          </View>

          <ProgressBar pct={game.completionPct} color={barColor} />
        </View>
      </View>
    </Pressable>
  );
}
