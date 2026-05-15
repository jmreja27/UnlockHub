import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';

import { usePublicProfile } from '../../hooks/usePublicProfile';
import { useFriends } from '../../hooks/useFriends';
import { useSessionStore } from '../../stores/sessionStore';
import { api } from '../../lib/api';
import { SkeletonBox } from '../../components/SkeletonBox';

interface CompareResult {
  targetUser: { username: string; level: number; xp: number; avatar: string | null };
  xpDiff: number;
  sharedAchievementCount: number;
  sharedGameCount: number;
}

function ProfileSkeleton() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SkeletonBox height={120} borderRadius={0} />
      <View className="px-4 -mt-10">
        <SkeletonBox width={80} height={80} borderRadius={40} />
        <SkeletonBox height={20} width="50%" style={{ marginTop: 12 }} />
        <SkeletonBox height={14} width="30%" style={{ marginTop: 6 }} />
        <SkeletonBox height={14} width="70%" style={{ marginTop: 16 }} />
      </View>
    </View>
  );
}

export default function PublicProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const { t } = useTranslation();

  const { data: profile, isLoading, isError, refetch } = usePublicProfile(username ?? '');
  const { sendRequest, isSending } = useFriends();
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);

  const { data: compareData } = useQuery({
    queryKey: ['compare', username],
    queryFn: () => api.get<CompareResult>(`/api/v1/users/${username}/compare`),
    enabled: !!username && isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  function handleAddFriend() {
    if (profile) sendRequest(profile.id);
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <Pressable
        onPress={() => router.back()}
        className="px-4 pt-2 pb-1"
        accessibilityLabel={t('common.back')}
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text className="text-indigo-400 text-base">{t('common.back')}</Text>
      </Pressable>

      {isLoading ? (
        <ProfileSkeleton />
      ) : isError || !profile ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text
            className="text-white text-lg font-semibold text-center"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {t('public_profile.error_title')}
          </Text>
          <Text className="text-gray-400 mt-2 text-center">
            {t('public_profile.error_message')}
          </Text>
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => void refetch()}
              tintColor="#fff"
            />
          }
        >
          <Image
            source={profile.banner ?? null}
            style={{ width: '100%', height: 120 }}
            contentFit="cover"
            placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
            accessibilityElementsHidden
          />
          <View className="px-4 -mt-10">
            <Image
              source={profile.avatar ?? null}
              style={{ width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: '#16213e' }}
              contentFit="cover"
              placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
              accessibilityLabel={t('public_profile.avatar_label', { username: profile.username })}
            />
            <Text
              className="text-white text-xl font-bold mt-2"
              accessibilityRole="header"
            >
              {profile.username}
            </Text>
            <Text className="text-gray-400 text-sm">
              {t('public_profile.level', { level: profile.level })} · {profile.xp} XP
            </Text>
            {profile.bio ? (
              <Text className="text-gray-300 text-sm mt-3">{profile.bio}</Text>
            ) : null}

            <Pressable
              onPress={handleAddFriend}
              disabled={isSending}
              className="mt-4 bg-indigo-600 rounded-xl py-3 items-center"
              accessibilityLabel={t('friends.add_friend_hint', { username: profile.username })}
              accessibilityRole="button"
              accessibilityState={{ disabled: isSending }}
            >
              <Text className="text-white font-semibold">
                {isSending ? t('common.loading') : t('friends.add_friend')}
              </Text>
            </Pressable>

            {profile.platformAccounts.length > 0 && (
              <View className="mt-6">
                <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">
                  {t('public_profile.platforms')}
                </Text>
                {profile.platformAccounts.map((pa) => (
                  <View key={pa.id} className="flex-row items-center py-2 border-b border-gray-800">
                    <Text className="text-white text-sm flex-1">{pa.platform}</Text>
                    <Text className="text-gray-400 text-sm">{pa.username}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Comparación de perfiles — solo para usuarios autenticados */}
            {compareData && (
              <View
                className="mt-6 bg-surface-elevated rounded-2xl px-4 py-4"
                accessible
                accessibilityLabel={t('public_profile.compare_title')}
              >
                <Text className="text-gray-300 text-xs font-semibold uppercase tracking-wider mb-3">
                  {t('public_profile.compare_title')}
                </Text>
                <View className="flex-row justify-around">
                  <View className="items-center">
                    <Text className="text-primary-light text-lg font-bold">
                      {compareData.sharedAchievementCount}
                    </Text>
                    <Text className="text-gray-400 text-xs text-center mt-0.5">
                      {t('public_profile.compare_shared_achievements')}
                    </Text>
                  </View>
                  <View className="w-px bg-surface-card" />
                  <View className="items-center">
                    <Text className="text-primary-light text-lg font-bold">
                      {compareData.sharedGameCount}
                    </Text>
                    <Text className="text-gray-400 text-xs text-center mt-0.5">
                      {t('public_profile.compare_shared_games')}
                    </Text>
                  </View>
                  <View className="w-px bg-surface-card" />
                  <View className="items-center">
                    <Text
                      className={`text-lg font-bold ${
                        compareData.xpDiff > 0
                          ? 'text-green-400'
                          : compareData.xpDiff < 0
                          ? 'text-red-400'
                          : 'text-gray-400'
                      }`}
                    >
                      {compareData.xpDiff > 0
                        ? `+${compareData.xpDiff.toLocaleString()}`
                        : compareData.xpDiff.toLocaleString()}
                    </Text>
                    <Text className="text-gray-400 text-xs text-center mt-0.5">
                      {t('public_profile.compare_xp_label')}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
