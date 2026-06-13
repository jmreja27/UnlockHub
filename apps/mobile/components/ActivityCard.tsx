import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import type { ActivityEvent } from '@unlockhub/types';

import { useTheme } from '../hooks/useTheme';
import { getCloudinaryThumb } from '../lib/cloudinary';

interface ActivityCardProps {
  event: ActivityEvent;
}

function relativeTime(isoDate: string, t: ReturnType<typeof useTranslation>['t']): string {
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diff < 60) return t('feed.just_now');
  if (diff < 3600) return t('feed.minutes_ago', { count: Math.floor(diff / 60) });
  if (diff < 86400) return t('feed.hours_ago', { count: Math.floor(diff / 3600) });
  return t('feed.days_ago', { count: Math.floor(diff / 86400) });
}

function eventLabel(event: ActivityEvent, t: ReturnType<typeof useTranslation>['t']): string {
  const u = event.user?.username ?? '';
  switch (event.type) {
    case 'ACHIEVEMENT_UNLOCKED':
      return t('feed.event_achievement', { username: u, title: String(event.payload['title'] ?? '') });
    case 'FRIEND_ADDED':
      return t('feed.event_friend', { username: u, friend: String(event.payload['friendUsername'] ?? '') });
    case 'LEVEL_UP':
      return t('feed.event_level', { username: u, level: String(event.payload['level'] ?? '') });
    case 'CHALLENGE_COMPLETED':
      return t('feed.event_challenge', { username: u, challenge: String(event.payload['title'] ?? '') });
    case 'STREAK_MILESTONE':
      return t('feed.event_streak', { username: u, days: String(event.payload['days'] ?? '') });
    case 'GAME_COMPLETED':
      return t('feed.event_game', { username: u, game: String(event.payload['gameName'] ?? '') });
    default:
      return t('feed.event_generic', { username: u });
  }
}

export function ActivityCard({ event }: ActivityCardProps) {
  const { t } = useTranslation();
  const colors = useTheme();
  const label = eventLabel(event, t);
  const time = relativeTime(event.createdAt, t);

  function handlePress() {
    void Haptics.selectionAsync();
  }

  return (
    <Pressable
      onPress={handlePress}
      accessibilityLabel={`${label}. ${time}`}
      accessibilityRole="button"
      className="flex-row items-center px-4 py-3"
      style={{ borderBottomWidth: 1, borderBottomColor: colors.separator }}
    >
      <Image
        source={getCloudinaryThumb(event.user?.avatar, 88, 88) ?? null}
        style={{ width: 44, height: 44, borderRadius: 22 }}
        contentFit="cover"
        placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
        accessibilityElementsHidden
      />
      <View className="flex-1 ml-3">
        <Text
          className="text-sm leading-5"
          style={{ color: colors.text }}
          accessibilityElementsHidden
          numberOfLines={2}
        >
          {label}
        </Text>
        <Text className="text-xs mt-1" style={{ color: colors.textMuted }} accessibilityElementsHidden>
          {time}
        </Text>
      </View>
    </Pressable>
  );
}
