import { useEffect } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import { usePublicProfile } from '../../hooks/usePublicProfile';
import { useUserGames } from '../../hooks/useUserGames';
import { useSessionStore } from '../../stores/sessionStore';
import { api, ApiRequestError } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import { SkeletonBox } from '../../components/SkeletonBox';
import { AvatarPlaceholder } from '../../components/AvatarPlaceholder';
import { FriendshipButton } from '../../components/FriendshipButton';
import { getPlatformColor } from '../../lib/platformColors';
import { useTheme } from '../../hooks/useTheme';
import { analytics } from '../../lib/analytics';
import { useSafeBack } from '../../hooks/useSafeBack';
import { getCloudinaryThumb } from '../../lib/cloudinary';
import { formatNumber } from '../../lib/formatTimeAgo';

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

const PLATFORM_LABEL: Record<string, string> = {
  STEAM: 'Steam',
  RA: 'RetroAchievements',
  XBOX: 'Xbox',
  PSN: 'PlayStation',
};

export default function PublicProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const safeBack = useSafeBack();
  const { t, i18n } = useTranslation();
  const colors = useTheme();

  const { data: profile, isLoading, isError, error, refetch } = usePublicProfile(username ?? '');
  const isFriendsOnly = isError && error instanceof ApiRequestError && error.statusCode === 403;
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  const currentUser = useSessionStore((s) => s.user);

  // Si el usuario visita su propio perfil (deep link, búsqueda con datos stale, etc.),
  // redirigir a la pestaña de perfil propio en lugar de mostrar el perfil público.
  // Se ejecuta solo cuando profile está cargado para no redirigir con datos indefinidos.
  useEffect(() => {
    if (currentUser && profile?.username === currentUser.username) {
      router.replace('/(tabs)/profile');
    }
  }, [currentUser, profile?.username, router]);

  const { data: compareData } = useQuery({
    queryKey: queryKeys.compareProfiles(username),
    queryFn: () => api.get<CompareResult>(`/api/v1/users/${username}/compare`),
    enabled: !!username && isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  const { data: gamesData, isLoading: gamesLoading } = useUserGames(username ?? '');

  function handleShare() {
    if (!username) return;
    const ogUrl = `https://unlockhub.app/u/${encodeURIComponent(username)}`;
    void Share.share({ message: ogUrl, url: ogUrl });
    analytics.profileShared();
  }

  if (!username) return null;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <View className="flex-row items-center justify-between px-4 pt-2 pb-1">
        <Pressable
          onPress={safeBack}
          accessibilityLabel={t('common.back')}
          accessibilityRole="button"
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
        >
          <Text className="text-indigo-400 text-base">{t('common.back')}</Text>
        </Pressable>
        {profile && (
          <Pressable
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel={t('public_profile.share_label')}
            style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' }}
            testID="share-profile-button"
          >
            <Ionicons name="share-social-outline" size={22} color="#818cf8" />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <ProfileSkeleton />
      ) : isError || !profile ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text
            className="text-lg font-semibold text-center"
            style={{ color: colors.text }}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {isFriendsOnly
              ? t('public_profile.friends_only_title')
              : t('public_profile.error_title')}
          </Text>
          <Text className="mt-2 text-center" style={{ color: colors.textSecondary }}>
            {isFriendsOnly
              ? t('public_profile.friends_only_message')
              : t('public_profile.error_message')}
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
            source={getCloudinaryThumb(profile.banner, 800, 240) ?? null}
            style={{ width: '100%', height: 120 }}
            contentFit="cover"
            placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
            accessibilityElementsHidden
          />
          <View className="px-4 -mt-10">
            {profile.avatar ? (
              <Image
                source={{ uri: getCloudinaryThumb(profile.avatar, 160, 160) }}
                style={{ width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: '#16213e' }}
                contentFit="cover"
                placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
                accessibilityLabel={t('public_profile.avatar_label', { username: profile.username })}
              />
            ) : (
              <AvatarPlaceholder
                username={profile.username}
                size={80}
                style={{ borderWidth: 3, borderColor: '#16213e' } as object}
              />
            )}
            <Text
              className="text-xl font-bold mt-2"
              style={{ color: colors.text }}
              accessibilityRole="header"
            >
              {profile.username}
            </Text>
            <Text className="text-sm" style={{ color: colors.textSecondary }}>
              {t('public_profile.level', { level: profile.level })} · {profile.xp} XP
            </Text>
            {profile.bio ? (
              <Text className="text-sm mt-3" style={{ color: colors.textSecondary }}>{profile.bio}</Text>
            ) : null}

            <FriendshipButton username={profile.username} />

            {profile.platformAccounts.length > 0 && (
              <View className="mt-6">
                <Text className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: colors.textSecondary }}>
                  {t('public_profile.platforms')}
                </Text>
                {profile.platformAccounts.map((pa) => (
                  <View key={pa.id} className="flex-row items-center py-2" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text className="text-sm flex-1" style={{ color: colors.text }}>{pa.platform}</Text>
                    <Text className="text-sm" style={{ color: colors.textSecondary }}>{pa.username}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Comparación de perfiles — solo para usuarios autenticados */}
            {compareData && (
              <View
                className="mt-6 rounded-2xl px-4 py-4"
                style={{ backgroundColor: colors.surface }}
                accessible
                accessibilityLabel={t('public_profile.compare_title')}
              >
                <Text className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: colors.textSecondary }}>
                  {t('public_profile.compare_title')}
                </Text>
                <View className="flex-row justify-around">
                  <View className="items-center">
                    <Text className="text-primary-light text-lg font-bold">
                      {compareData.sharedAchievementCount}
                    </Text>
                    <Text className="text-xs text-center mt-0.5" style={{ color: colors.textSecondary }}>
                      {t('public_profile.compare_shared_achievements')}
                    </Text>
                  </View>
                  <View className="w-px" style={{ backgroundColor: colors.border }} />
                  <View className="items-center">
                    <Text className="text-primary-light text-lg font-bold">
                      {compareData.sharedGameCount}
                    </Text>
                    <Text className="text-xs text-center mt-0.5" style={{ color: colors.textSecondary }}>
                      {t('public_profile.compare_shared_games')}
                    </Text>
                  </View>
                  <View className="w-px" style={{ backgroundColor: colors.border }} />
                  <View className="items-center">
                    <Text
                      className="text-lg font-bold"
                      style={{ color: compareData.xpDiff > 0 ? '#4ade80' : compareData.xpDiff < 0 ? '#f87171' : colors.textSecondary }}
                    >
                      {compareData.xpDiff > 0
                        ? `+${formatNumber(compareData.xpDiff, i18n.language)}`
                        : formatNumber(compareData.xpDiff, i18n.language)}
                    </Text>
                    <Text className="text-xs text-center mt-0.5" style={{ color: colors.textSecondary }}>
                      {t('public_profile.compare_xp_label')}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Sección de juegos — F21 */}
            <View className="mt-6 mb-8">
              <Text className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: colors.textSecondary }}>
                {t('public_profile.games_section')}
              </Text>
              {gamesLoading ? (
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {[0, 1, 2].map((i) => (
                    <SkeletonBox key={i} height={64} style={{ marginBottom: 8 }} borderRadius={12} />
                  ))}
                </View>
              ) : !gamesData || gamesData.data.length === 0 ? (
                <Text className="text-sm" style={{ color: colors.textMuted }}>{t('public_profile.no_games')}</Text>
              ) : (
                gamesData.data.map((game) => {
                  const platformColor = getPlatformColor(game.platform);
                  const pct = game.completionPct;
                  return (
                    <Pressable
                      key={game.id}
                      onPress={() => router.push(`/user-game/${profile?.username ?? ''}/${game.id}` as never)}
                      className="rounded-xl mb-2 px-4 py-3 active:opacity-70"
                      style={{ backgroundColor: colors.surfaceCard }}
                      accessibilityRole="button"
                      accessibilityLabel={`${game.title}, ${game.earnedAchievements}/${game.totalAchievements} logros, ${pct}%`}
                    >
                      <View className="flex-row items-center">
                        <Image
                          source={game.iconUrl ?? require('../../assets/images/icon.png')}
                          style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: colors.surface }}
                          contentFit="contain"
                          accessibilityElementsHidden
                        />
                        <View className="flex-1 ml-3">
                          <View className="flex-row items-center justify-between">
                            <Text className="font-semibold text-sm flex-1 mr-2" style={{ color: colors.text }} numberOfLines={1}>
                              {game.title}
                            </Text>
                            <View
                              className="px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: platformColor + '33' }}
                              importantForAccessibility="no"
                            >
                              <Text className="text-xs font-medium" style={{ color: platformColor }}>
                                {PLATFORM_LABEL[game.platform] ?? game.platform}
                              </Text>
                            </View>
                          </View>
                          <View className="flex-row items-center justify-between mt-0.5">
                            <Text className="text-xs" style={{ color: colors.textSecondary }}>
                              {game.earnedAchievements}/{game.totalAchievements}
                            </Text>
                            <Text className="text-xs font-semibold" style={{ color: game.isCompleted ? '#22c55e' : platformColor }}>
                              {game.isCompleted ? '100%' : `${pct}%`}
                            </Text>
                          </View>
                          <View className="h-1.5 rounded-full overflow-hidden mt-1.5" style={{ backgroundColor: colors.background }} accessibilityElementsHidden>
                            <View style={{ width: `${pct}%`, backgroundColor: game.isCompleted ? '#22c55e' : platformColor, height: '100%', borderRadius: 9999 }} />
                          </View>
                        </View>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
