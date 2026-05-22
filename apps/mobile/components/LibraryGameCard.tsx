import { Pressable, View, Text } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { LibraryGame } from '../hooks/useMyGames';

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
  // #1e90ff (DodgerBlue) — mayor contraste que #003087 en fondo oscuro (ratio ~6.5:1 vs blanco)
  PSN: '#1e90ff',
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
  const platformColor = PLATFORM_COLOR[game.platform] ?? '#6b7280';

  // Color y estado de completado
  let barColor: string;
  let pctLabel: string;
  let psnBadge: string | null = null;

  if (game.isCompleted) {
    barColor = '#22c55e';
    pctLabel = t('library.complete');
  } else {
    barColor = platformColor;
    pctLabel = `${game.completionPct}%`;
  }

  // Badges PSN: platino o 100% completo
  if (game.platform === 'PSN') {
    if (game.isCompleted) {
      psnBadge = t('library.psn_100');
    } else if (game.platinumEarned) {
      psnBadge = t('library.psn_platinum');
    }
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
          style={{ width: 44, height: 44, borderRadius: 8 }}
          contentFit="cover"
          accessibilityElementsHidden
        />
        <View className="flex-1 ml-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-white font-semibold text-sm flex-1 mr-2" numberOfLines={1}>
              {game.title}
            </Text>
            <View className="flex-row items-center gap-1.5">
              {/* Badge PSN especial (platino o 100%) */}
              {psnBadge && (
                <View
                  className="px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: game.isCompleted ? '#22c55e33' : '#f5c518' + '33' }}
                  importantForAccessibility="no"
                >
                  <Text
                    className="text-xs font-bold"
                    style={{ color: game.isCompleted ? '#22c55e' : '#f5c518' }}
                  >
                    {psnBadge}
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
