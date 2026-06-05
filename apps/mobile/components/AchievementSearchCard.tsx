import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { AchievementSearchResult } from '@unlockhub/types';

import { getPlatformColor } from '../lib/platformColors';
import { useTheme } from '../hooks/useTheme';

const PLATFORM_LABEL: Record<string, string> = {
  STEAM: 'Steam',
  RA: 'RetroAchievements',
  PSN: 'PlayStation',
};

interface Props {
  achievement: AchievementSearchResult;
}

export function AchievementSearchCard({ achievement }: Props) {
  const { t } = useTranslation();
  const colors = useTheme();
  const platformLabel = PLATFORM_LABEL[achievement.platform] ?? achievement.platform;
  const platformColor = getPlatformColor(achievement.platform);

  const accessLabel = t('search.achievement_item_label', {
    title: achievement.title,
    game: achievement.game.title,
    platform: platformLabel,
    status: achievement.isUnlocked ? t('search.achievement_unlocked') : '',
  });

  return (
    <Pressable
      onPress={() => router.push(`/game/${achievement.game.id}`)}
      className="flex-row items-center rounded-xl px-3 py-3 mb-2"
      style={{ backgroundColor: colors.surfaceCard, minHeight: 44 }}
      accessibilityRole="button"
      accessibilityLabel={accessLabel}
      accessibilityHint={t('search.achievement_in_game', { game: achievement.game.title })}
    >
      {/* Icono del logro */}
      <View style={{ position: 'relative' }}>
        <Image
          source={achievement.iconUrl ?? require('../assets/images/icon.png')}
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            opacity: achievement.isUnlocked ? 1 : 0.4,
          }}
          contentFit="cover"
          accessibilityElementsHidden
        />
        {!achievement.isUnlocked && (
          <Text
            style={{ position: 'absolute', bottom: 0, right: 0, fontSize: 10 }}
            accessibilityElementsHidden
          >
            🔒
          </Text>
        )}
        {achievement.isUnlocked && (
          <Text
            style={{ position: 'absolute', bottom: 0, right: 0, fontSize: 10 }}
            accessibilityElementsHidden
          >
            ✓
          </Text>
        )}
      </View>

      {/* Información del logro */}
      <View className="flex-1 ml-3">
        <Text
          className="text-sm font-semibold"
          style={{ color: achievement.isUnlocked ? colors.text : colors.textSecondary }}
          numberOfLines={1}
        >
          {achievement.title}
        </Text>
        <Text className="text-xs mt-0.5" style={{ color: colors.textMuted }} numberOfLines={1}>
          {t('search.achievement_in_game', { game: achievement.game.title })}
        </Text>
        <View className="flex-row items-center gap-2 mt-1">
          <Text className="text-primary-light text-xs font-medium">
            {t('search.achievement_xp', { xp: achievement.normalizedPoints })}
          </Text>
          {achievement.rarity != null && (
            <Text className="text-xs" style={{ color: colors.textMuted }}>
              {t('search.achievement_rarity', { pct: achievement.rarity.toFixed(1) })}
            </Text>
          )}
        </View>
      </View>

      {/* Badge de plataforma */}
      <View
        className="px-2 py-0.5 rounded-full ml-2 self-start mt-1"
        style={{ backgroundColor: platformColor }}
      >
        <Text className="text-xs font-medium" style={{ color: '#ffffff' }}>{platformLabel}</Text>
      </View>
    </Pressable>
  );
}
