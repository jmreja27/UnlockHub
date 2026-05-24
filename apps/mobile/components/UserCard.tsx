import { Pressable, View, Text } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { UserSearchResult } from '@unlockhub/types';

import { AvatarPlaceholder } from './AvatarPlaceholder';

interface Props {
  user: UserSearchResult;
}

export function UserCard({ user }: Props) {
  const { t } = useTranslation();

  return (
    <Pressable
      onPress={() => router.push(`/profile/${user.username}`)}
      className="flex-row items-center px-4 py-3 bg-surface-card rounded-xl mb-2 active:opacity-70"
      accessibilityRole="button"
      accessibilityLabel={t('search.user_item_label', {
        username: user.username,
        level: user.level,
      })}
    >
      {user.avatar ? (
        <Image
          source={{ uri: user.avatar }}
          style={{ width: 48, height: 48, borderRadius: 24 }}
          contentFit="cover"
          accessibilityElementsHidden
        />
      ) : (
        <AvatarPlaceholder username={user.username} size={48} />
      )}
      <View className="flex-1 ml-3">
        <Text className="text-white font-semibold text-sm">@{user.username}</Text>
        <Text className="text-gray-400 text-xs mt-0.5">
          {t('search.user_level', { level: user.level })} · {user.xp.toLocaleString()} XP
        </Text>
      </View>
    </Pressable>
  );
}
