import { Pressable, View, Text } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { UserSearchResult } from '@unlockhub/types';

import { getCloudinaryThumb } from '../lib/cloudinary';
import { useTheme } from '../hooks/useTheme';

import { AvatarPlaceholder } from './AvatarPlaceholder';

interface Props {
  user: UserSearchResult;
}

export function UserCard({ user }: Props) {
  const { t } = useTranslation();
  const colors = useTheme();

  return (
    <Pressable
      onPress={() => router.push(`/profile/${user.username}`)}
      className="flex-row items-center px-4 py-3 rounded-xl mb-2 active:opacity-70"
      style={{ backgroundColor: colors.surfaceCard }}
      accessibilityRole="button"
      accessibilityLabel={t('search.user_item_label', {
        username: user.username,
        level: user.level,
      })}
    >
      {user.avatar ? (
        <Image
          source={{ uri: getCloudinaryThumb(user.avatar, 96, 96) }}
          style={{ width: 48, height: 48, borderRadius: 24 }}
          contentFit="cover"
          accessibilityElementsHidden
        />
      ) : (
        <AvatarPlaceholder username={user.username} size={48} />
      )}
      <View className="flex-1 ml-3">
        <Text className="font-semibold text-sm" style={{ color: colors.text }}>@{user.username}</Text>
        <Text className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
          {t('search.user_level', { level: user.level })} · {user.xp.toLocaleString()} XP
        </Text>
      </View>
    </Pressable>
  );
}
