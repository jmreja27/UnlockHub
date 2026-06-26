// Pantalla de perfil de usuario: avatar, stats, plataformas y logout
import { useState, useCallback, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, Alert, ActivityIndicator, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PlatformAccount, ProfileVisibility } from '@unlockhub/types';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useSessionStore } from '../../stores/sessionStore';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import { useTheme } from '../../hooks/useTheme';
import { useRewardedAd } from '../../hooks/useRewardedAd';
import { usePreferencesStore, type ThemePreference } from '../../stores/preferencesStore';
import { SkeletonBox } from '../../components/SkeletonBox';
import { PremiumBanner } from '../../components/PremiumBanner';
import { ActivityCard } from '../../components/ActivityCard';
import { AvatarPlaceholder } from '../../components/AvatarPlaceholder';
import { FEATURES } from '../../lib/featureFlags';
import { api, uploadFile, getAccessToken } from '../../lib/api';
import { useFeed } from '../../hooks/useFeed';
import { queryKeys } from '../../lib/queryKeys';
import { getCloudinaryThumb } from '../../lib/cloudinary';
import { formatNumber, formatFullDate } from '../../lib/formatTimeAgo';

interface UserStats {
  xpByWeek: { week: string; xp: number }[];
  rarestAchievement: { id: string; title: string; iconUrl: string | null; rarity: number; platform: string } | null;
  favoritePlatform: string | null;
  bestStreak: number;
  completedGames: number;
  totalAchievements: number;
  totalXp: number;
}

function isWrappedAvailable(): boolean {
  return new Date().getMonth() >= 11; // Disponible desde diciembre (mes 11 en base 0)
}

function getWrappedYears(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  // Años pasados siempre accesibles; año actual solo desde diciembre
  for (let y = currentYear - 1; y >= 2024; y--) years.push(y);
  if (isWrappedAvailable()) years.unshift(currentYear);
  return years;
}

const AVATAR_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

// Etiquetas legibles para cada plataforma
const PLATFORM_LABELS: Record<string, string> = {
  STEAM: 'Steam',
  RA: 'RetroAchievements',
  XBOX: 'Xbox',
  PSN: 'PlayStation',
};

// Colores por plataforma
const PLATFORM_COLORS: Record<string, string> = {
  STEAM: '#1b2838',
  RA: '#c0392b',
  XBOX: '#107c10',
  PSN: '#003791',
};

function ProfileSkeleton() {
  return (
    <View className="px-6">
      {/* Avatar y nombre */}
      <View className="items-center pt-8 pb-6">
        <SkeletonBox width={96} height={96} borderRadius={48} style={{ marginBottom: 12 }} />
        <SkeletonBox width={160} height={24} borderRadius={6} style={{ marginBottom: 8 }} />
        <SkeletonBox width={100} height={16} borderRadius={4} />
      </View>
      {/* Stats */}
      <View className="flex-row justify-around mb-6">
        {[1, 2, 3].map((i) => (
          <View key={i} className="items-center">
            <SkeletonBox width={50} height={24} borderRadius={4} style={{ marginBottom: 4 }} />
            <SkeletonBox width={60} height={14} borderRadius={4} />
          </View>
        ))}
      </View>
      {/* Plataformas */}
      <SkeletonBox width={'100%'} height={80} borderRadius={12} style={{ marginBottom: 12 }} />
      <SkeletonBox width={'100%'} height={80} borderRadius={12} />
    </View>
  );
}

const APP_VERSION = Constants.expoConfig?.version ?? '—';
const APP_BUILD = String(Constants.expoConfig?.android?.versionCode ?? '—');

const REWARDED_COOLDOWN_KEY = 'admob:rewarded_ad:last_claimed';
const REWARDED_COOLDOWN_MS = 3 * 60 * 60 * 1000;

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const colors = useTheme();
  const { user, isAuthenticated } = useSessionStore();
  const { logout, isLoggingOut } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rewardedCooldownEnd, setRewardedCooldownEnd] = useState<number>(0);
  const [isWatchingAd, setIsWatchingAd] = useState(false);

  // Obtiene las plataformas vinculadas del usuario
  const queryClient = useQueryClient();

  const { events, isError: isFeedError, refetch: refetchFeed } = useFeed();
  const { currentLanguage, changeLanguage } = useLanguage();
  const { theme: currentTheme, setTheme } = usePreferencesStore();

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: queryKeys.userStats(),
    queryFn: () => api.get<UserStats>('/api/v1/users/me/stats'),
    enabled: isAuthenticated && FEATURES.advancedStats && (user?.isPremium ?? false),
    staleTime: 1000 * 60 * 60,
  });

  const {
    data: platforms,
    isLoading: isLoadingPlatforms,
    refetch: refetchPlatforms,
  } = useQuery({
    queryKey: queryKeys.platforms(user?.id ?? ''),
    queryFn: () => api.get<PlatformAccount[]>('/api/v1/platforms/'),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  const {
    data: pointsData,
    isLoading: pointsLoading,
    refetch: refetchPoints,
  } = useQuery({
    queryKey: queryKeys.myPointsTotal(),
    queryFn: () => api.get<{ total: number }>('/api/v1/users/me/points/total'),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 2,
  });
  const pointsBalance = pointsData?.total ?? 0;

  const { showForReward, isReady: isAdReady } = useRewardedAd();
  const isOnCooldown = rewardedCooldownEnd > Date.now();
  const cooldownHoursLeft = isOnCooldown
    ? Math.ceil((rewardedCooldownEnd - Date.now()) / (1000 * 60 * 60))
    : 0;

  async function readRewardedCooldown() {
    try {
      const raw = await AsyncStorage.getItem(REWARDED_COOLDOWN_KEY);
      if (raw !== null) {
        const lastClaimed = parseInt(raw, 10);
        setRewardedCooldownEnd(lastClaimed + REWARDED_COOLDOWN_MS);
      }
    } catch {
      // AsyncStorage no disponible — ignorar
    }
  }

  useEffect(() => {
    void readRewardedCooldown();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void readRewardedCooldown();
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unlinkMutation = useMutation({
    mutationFn: (platform: string) =>
      api.delete(`/api/v1/platforms/${platform.toLowerCase()}/unlink`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.platforms(user?.id ?? '') });
      void queryClient.invalidateQueries({ queryKey: queryKeys.linkedPlatforms() });
      // Los logros y juegos de la plataforma se borraron en el backend — actualizar la biblioteca
      void queryClient.invalidateQueries({ queryKey: queryKeys.myGames() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.userStats() });
      // refetchQueries (no invalidateQueries) para que anyPlatformLinked se actualice
      // de forma INMEDIATA sin esperar al staleTime — evita el flash de "Tus juegos
      // aparecerán pronto" cuando el refetch de my-games termina antes que el de sync-summary.
      void queryClient.refetchQueries({ queryKey: queryKeys.syncSummaryBase() });
    },
    onError: () => {
      Alert.alert(t('profile.unlink_error_title'), t('profile.unlink_error_message'));
      // Resincroniza el estado real: el backend no cambió nada
      void queryClient.invalidateQueries({ queryKey: queryKeys.platforms(user?.id ?? '') });
    },
  });

  const bannerMutation = useMutation({
    mutationFn: async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('profile.avatar_permission_title'), t('profile.avatar_permission_message'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      const uri = result.assets[0].uri;
      const filename = uri.split('/').pop() ?? 'banner.jpg';
      const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
      const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
      const type = mimeMap[ext] ?? 'image/jpeg';
      const form = new FormData();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      form.append('banner', { uri, name: filename, type } as any);
      return uploadFile<{ banner: string }>('/api/v1/users/me/banner', form, getAccessToken());
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (data?.banner) {
        const current = useSessionStore.getState().user;
        if (current) {
          useSessionStore.getState().setUser({ ...current, banner: data.banner });
        }
      }
    },
    onError: () => {
      Alert.alert(t('profile.banner_error_title'), t('profile.banner_error_message'));
    },
  });

  const avatarMutation = useMutation({
    mutationFn: async (uri: string) => {
      const form = new FormData();
      const filename = uri.split('/').pop() ?? 'avatar.jpg';
      const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
      const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
      const type = mimeMap[ext] ?? 'image/jpeg';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      form.append('avatar', { uri, name: filename, type } as any);
      return uploadFile<{ avatar: string }>('/api/v1/users/me/avatar', form, getAccessToken());
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (data?.avatar) {
        const current = useSessionStore.getState().user;
        if (current) {
          useSessionStore.getState().setUser({ ...current, avatar: data.avatar });
        }
      }
    },
    onError: () => {
      Alert.alert(t('profile.avatar_error_title'), t('profile.avatar_error_message'));
    },
  });

  async function handleAvatarPress() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('profile.avatar_permission_title'), t('profile.avatar_permission_message'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      avatarMutation.mutate(result.assets[0].uri);
    }
  }

  function handleUnlink(platform: string, label: string) {
    const platformKey = platform.toLowerCase();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      label,
      t(`link_platform.${platformKey}.unlink_confirm`),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t(`link_platform.${platformKey}.unlink`),
          style: 'destructive',
          onPress: () => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            unlinkMutation.mutate(platform);
          },
        },
      ],
    );
  }

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchPlatforms(), refetchPoints()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchPlatforms, refetchPoints]);

  const privacyMutation = useMutation({
    mutationFn: (visibility: ProfileVisibility) =>
      api.patch<{ profileVisibility: ProfileVisibility }>('/api/v1/users/me', { profileVisibility: visibility }),
    onSuccess: (data) => {
      const current = useSessionStore.getState().user;
      if (current) {
        useSessionStore.getState().setUser({ ...current, profileVisibility: data.profileVisibility });
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => api.delete('/api/v1/users/me'),
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      logout();
    },
    onError: () => {
      // Título inequívoco: la cuenta NO fue eliminada — el usuario no debe dudar
      Alert.alert(t('profile.delete_account_error_title'), t('profile.delete_account_error'));
    },
  });

  function handleDeleteAccount() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      t('profile.delete_account_dialog_title'),
      t('profile.delete_account_dialog_message'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.delete_account_confirm'),
          style: 'destructive',
          onPress: () => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            deleteAccountMutation.mutate();
          },
        },
      ],
      { cancelable: true },
    );
  }

  async function handleWatchAd() {
    if (!isAdReady) {
      Alert.alert(
        t('profile.points_rewarded_unavailable_title'),
        t('profile.points_rewarded_unavailable_body'),
      );
      return;
    }
    setIsWatchingAd(true);
    try {
      const pts = await showForReward();
      if (pts !== null) {
        const now = Date.now();
        await AsyncStorage.setItem(REWARDED_COOLDOWN_KEY, String(now));
        setRewardedCooldownEnd(now + REWARDED_COOLDOWN_MS);
        void queryClient.invalidateQueries({ queryKey: queryKeys.myPointsTotal() });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          t('profile.points_rewarded_success_title'),
          t('profile.points_rewarded_success_body', { pts }),
        );
      } else {
        Alert.alert(
          t('common.error_boundary_title'),
          t('profile.points_rewarded_error'),
        );
      }
    } finally {
      setIsWatchingAd(false);
    }
  }

  function handleLogout() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      t('profile.logout_dialog_title'),
      t('profile.logout_dialog_message'),
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('profile.logout'),
          style: 'destructive',
          onPress: () => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            logout();
          },
        },
      ],
      { cancelable: true },
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={['left', 'right']}>
      {/* Estado no autenticado */}
      {(!isAuthenticated || !user) ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text
            className="text-2xl font-bold mb-3 text-center"
            style={{ color: colors.text }}
            accessibilityRole="header"
          >
            {t('profile.title')}
          </Text>
          <Text className="text-base text-center mb-8" style={{ color: colors.textSecondary }}>
            {t('profile.unauthenticated_message')}
          </Text>
          <Pressable
            className="w-full bg-primary rounded-xl py-4 items-center active:opacity-80"
            onPress={() => router.push('/(auth)/login')}
            accessibilityRole="button"
            accessibilityLabel={t('profile.login')}
            accessibilityHint={t('profile.login_hint')}
            style={{ minHeight: 52 }}
          >
            <Text className="font-semibold text-base" style={{ color: '#ffffff' }}>{t('profile.login')}</Text>
          </Pressable>
        </View>
      ) : (isLoadingPlatforms && !platforms) ? (
        /* Estado de carga inicial */
        <ProfileSkeleton />
      ) : (
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => { void handleRefresh(); }}
            tintColor="#818cf8"
            colors={['#4f46e5']}
            accessibilityLabel={t('profile.refresh_label')}
          />
        }
      >
        {/* Banner de perfil — franja horizontal superior */}
        <Pressable
          onPress={() => { bannerMutation.mutate(); }}
          accessibilityRole="button"
          accessibilityLabel={t('profile.change_banner')}
          style={{ width: '100%', height: 120 }}
        >
          {user.banner ? (
            <Image
              source={{ uri: getCloudinaryThumb(user.banner, 800, 240) }}
              style={{ width: '100%', height: 120 }}
              contentFit="cover"
              accessibilityElementsHidden
            />
          ) : (
            <View style={{ width: '100%', height: 120, backgroundColor: '#1e293b' }} />
          )}
          {bannerMutation.isPending ? (
            <View
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}
              accessibilityLiveRegion="polite"
              accessibilityLabel={t('common.loading')}
            >
              <ActivityIndicator color="white" />
            </View>
          ) : (
            <View
              style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 6 }}
              importantForAccessibility="no"
              accessibilityElementsHidden
            >
              <Ionicons name="camera" size={18} color="white" />
            </View>
          )}
        </Pressable>

        {/* Sección de avatar y datos principales */}
        <View
          className="items-center pt-6 pb-6 px-6"
          accessible
          accessibilityLabel={t('profile.profile_aria', {
            username: user.username,
            level: user.level ?? 1,
            xp: formatNumber(user.xp ?? 0, i18n.language),
          })}
        >
          <Pressable
            onPress={() => { void handleAvatarPress(); }}
            accessibilityRole="button"
            accessibilityLabel={t('profile.change_avatar')}
            style={{ width: 96, height: 96, borderRadius: 48, marginBottom: 12 }}
          >
            {user.avatar ? (
              <Image
                source={{ uri: getCloudinaryThumb(user.avatar, 192, 192) }}
                placeholder={AVATAR_BLURHASH}
                style={{ width: 96, height: 96, borderRadius: 48 }}
                contentFit="cover"
                transition={300}
                accessibilityElementsHidden
              />
            ) : (
              <AvatarPlaceholder username={user.username} size={96} />
            )}
            {avatarMutation.isPending ? (
              <View
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 48, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}
                accessibilityLiveRegion="polite"
                accessibilityLabel={t('common.loading')}
              >
                <ActivityIndicator color="#818cf8" />
              </View>
            ) : (
              /* Indicador de cámara — indica al usuario que puede cambiar el avatar */
              <View
                style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: '#818cf8', justifyContent: 'center', alignItems: 'center' }}
                importantForAccessibility="no"
                accessibilityElementsHidden
              >
                <Ionicons name="camera" size={16} color="#fff" />
              </View>
            )}
          </Pressable>

          <Text className="text-2xl font-bold mb-1" style={{ color: colors.text }}>{user.username}</Text>

          {user.bio && (
            <Text className="text-sm text-center mt-1 mb-2" style={{ color: colors.textSecondary }}>{user.bio}</Text>
          )}

          {FEATURES.premium && user.isPremium && (
            <View className="bg-primary/30 border border-primary/50 rounded-full px-3 py-1 mt-2">
              <Text
                className="text-primary-light text-xs font-semibold"
                accessibilityLabel={t('profile.premium_label')}
              >
                {t('profile.premium_badge')}
              </Text>
            </View>
          )}
        </View>

        {/* Estadísticas: nivel, XP, racha */}
        <View
          className="flex-row mx-6 mb-6 rounded-2xl py-4"
          style={{ backgroundColor: colors.surface }}
          accessible
          accessibilityLabel={t('profile.stats_aria', {
            level: user.level ?? 1,
            xp: formatNumber(user.xp ?? 0, i18n.language),
            streak: user.streakDays ?? 0,
          })}
        >
          <View className="flex-1 items-center">
            <Text className="text-xl font-bold" style={{ color: colors.text }}>{user.level ?? 1}</Text>
            <Text className="text-xs mt-1" style={{ color: colors.textSecondary }}>{t('profile.stat_level')}</Text>
          </View>
          <View className="w-px" style={{ backgroundColor: colors.border }} />
          <View className="flex-1 items-center">
            <Text className="text-xl font-bold" style={{ color: colors.text }}>{formatNumber(user.xp ?? 0, i18n.language)}</Text>
            <Text className="text-xs mt-1" style={{ color: colors.textSecondary }}>{t('profile.stat_xp')}</Text>
          </View>
          <View className="w-px" style={{ backgroundColor: colors.border }} />
          <View className="flex-1 items-center">
            <View className="flex-row items-center gap-1">
              <Text className="text-xl font-bold" style={{ color: colors.text }}>{user.streakDays ?? 0}</Text>
              {(user as unknown as { streakShields?: number }).streakShields != null &&
                (user as unknown as { streakShields: number }).streakShields > 0 && (
                  <View
                    className="bg-indigo-900/60 border border-indigo-500/50 rounded-full px-1.5 py-0.5"
                    accessible
                    accessibilityLabel={t('profile.streak_shields_label', {
                      count: (user as unknown as { streakShields: number }).streakShields,
                    })}
                  >
                    <Text className="text-indigo-300 text-xs font-bold">
                      🛡 {(user as unknown as { streakShields: number }).streakShields}
                    </Text>
                  </View>
                )}
            </View>
            <Text className="text-xs mt-1" style={{ color: colors.textSecondary }}>{t('profile.stat_streak')}</Text>
          </View>
        </View>

        {/* Plataformas vinculadas */}
        <View className="px-6 mb-6">
          <Text className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: colors.textSecondary }}>
            {t('profile.platforms_section')}
          </Text>

          {platforms && platforms.length > 0 ? (
            platforms.map((account) => {
              const canUnlink = account.platform === 'PSN' || account.platform === 'STEAM' || account.platform === 'RA';
              const label = PLATFORM_LABELS[account.platform] ?? account.platform;
              return (
                <View
                  key={account.id}
                  className="flex-row items-center rounded-xl px-4 py-3 mb-2"
                  style={{ backgroundColor: colors.surface }}
                  accessible
                  accessibilityLabel={`${label}: ${account.username}`}
                >
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: PLATFORM_COLORS[account.platform] ?? '#6b7280',
                      marginRight: 12,
                    }}
                    accessibilityElementsHidden
                  />
                  <View className="flex-1">
                    <Text className="font-semibold text-sm" style={{ color: colors.text }}>{label}</Text>
                    <Text className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>{account.username}</Text>
                  </View>
                  {account.platform === 'PSN' && account.psnProfilePrivate && (
                    <Pressable
                      onPress={() => router.push('/link-platform/psn')}
                      accessibilityRole="button"
                      accessibilityLabel={t('link_platform.psn.profile_private_title')}
                      style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', marginRight: 4 }}
                      testID="psn-private-badge"
                    >
                      <Ionicons name="warning" size={18} color="#fbbf24" />
                    </Pressable>
                  )}
                  {account.lastSyncedAt && !account.psnProfilePrivate && (
                    <Text className="text-xs mr-2" style={{ color: colors.textMuted }}>
                      {t('profile.sync_prefix')} {formatFullDate(account.lastSyncedAt)}
                    </Text>
                  )}
                  {canUnlink && (
                    <Pressable
                      onPress={() => handleUnlink(account.platform, label)}
                      accessibilityRole="button"
                      accessibilityLabel={t(`link_platform.${account.platform.toLowerCase()}.unlink`)}
                      style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' }}
                    >
                      <Text className="text-red-400 text-xs">✕</Text>
                    </Pressable>
                  )}
                </View>
              );
            })
          ) : (
            <View
              className="rounded-xl px-4 py-6 items-center"
              style={{ backgroundColor: colors.surface }}
              accessible
              accessibilityLiveRegion="polite"
            >
              <Text className="text-sm text-center" style={{ color: colors.textSecondary }}>
                {t('profile.platforms_empty')}
              </Text>
            </View>
          )}

          {/* Botones para vincular PSN / Steam / RA si aún no están vinculados */}
          {(() => {
            const linked = new Set(platforms?.map((p) => p.platform) ?? []);
            return (
              <View className="mt-2 gap-2">
                {!linked.has('PSN') && (
                  <Pressable
                    onPress={() => router.push('/link-platform/psn')}
                    accessibilityRole="button"
                    accessibilityLabel={t('link_platform.psn.submit_label')}
                    className="flex-row items-center rounded-xl px-4 py-3 active:opacity-80"
                    style={{ minHeight: 52, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#00379199' }}
                  >
                    <View
                      style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#003791', marginRight: 12 }}
                      accessibilityElementsHidden
                    />
                    <Text className="font-semibold text-sm flex-1" style={{ color: colors.text }}>
                      {t('link_platform.psn.submit')}
                    </Text>
                    <Text className="text-lg" style={{ color: colors.textSecondary }}>›</Text>
                  </Pressable>
                )}
                {!linked.has('STEAM') && (
                  <Pressable
                    onPress={() => router.push('/link-platform/steam')}
                    accessibilityRole="button"
                    accessibilityLabel={t('link_platform.steam.submit_label')}
                    className="flex-row items-center rounded-xl px-4 py-3 active:opacity-80"
                    style={{ minHeight: 52, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#1b2838' }}
                  >
                    <View
                      style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#1b9fff', marginRight: 12 }}
                      accessibilityElementsHidden
                    />
                    <Text className="font-semibold text-sm flex-1" style={{ color: colors.text }}>
                      {t('link_platform.steam.submit')}
                    </Text>
                    <Text className="text-lg" style={{ color: colors.textSecondary }}>›</Text>
                  </Pressable>
                )}
                {!linked.has('RA') && (
                  <Pressable
                    onPress={() => router.push('/link-platform/ra')}
                    accessibilityRole="button"
                    accessibilityLabel={t('link_platform.ra.submit_label')}
                    className="flex-row items-center rounded-xl px-4 py-3 active:opacity-80"
                    style={{ minHeight: 52, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#c0392b99' }}
                  >
                    <View
                      style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#c0392b', marginRight: 12 }}
                      accessibilityElementsHidden
                    />
                    <Text className="font-semibold text-sm flex-1" style={{ color: colors.text }}>
                      {t('link_platform.ra.submit')}
                    </Text>
                    <Text className="text-lg" style={{ color: colors.textSecondary }}>›</Text>
                  </Pressable>
                )}
              </View>
            );
          })()}
        </View>

        {/* Sección de puntos — F36: saldo visible para todos · F37: rewarded ad para usuarios free */}
        <View className="px-6 mb-6" testID="points-section">
          <Text className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: colors.textSecondary }}>
            {t('profile.points_section')}
          </Text>

          <View className="rounded-2xl px-5 py-4" style={{ backgroundColor: colors.surface }}>
            {/* Saldo de puntos */}
            <View className="flex-row items-center mb-1">
              <Ionicons name="star" size={20} color="#f59e0b" accessibilityElementsHidden />
              <View className="ml-3 flex-1">
                {pointsLoading ? (
                  <View style={{ height: 28, justifyContent: 'center' }}>
                    <View style={{ height: 20, width: 80, borderRadius: 4, backgroundColor: colors.surfaceCard }} />
                  </View>
                ) : (
                  <Text
                    className="text-2xl font-bold"
                    style={{ color: colors.text }}
                    accessibilityLabel={`${pointsBalance} ${t('profile.points_label')}`}
                    testID="points-balance"
                  >
                    {formatNumber(pointsBalance, i18n.language)}
                    {'  '}
                    <Text className="text-sm font-normal" style={{ color: colors.textSecondary }}>
                      {t('profile.points_label')}
                    </Text>
                  </Text>
                )}
              </View>
            </View>

            {/* Texto secundario */}
            <Text className="text-xs mt-2 mb-4" style={{ color: colors.textSecondary }}>
              {t('profile.points_coming_soon')}
            </Text>

            {/* Botón rewarded ad — solo para usuarios free */}
            {!user.isPremium && (
              <Pressable
                onPress={() => { void handleWatchAd(); }}
                disabled={isOnCooldown || isWatchingAd || !isAdReady}
                accessibilityRole="button"
                accessibilityLabel={
                  isOnCooldown
                    ? t('profile.points_rewarded_cooldown', { hours: cooldownHoursLeft })
                    : !isAdReady
                    ? t('profile.points_watch_ad_loading')
                    : t('profile.points_watch_ad')
                }
                accessibilityState={{ disabled: isOnCooldown || isWatchingAd || !isAdReady, busy: isWatchingAd }}
                testID="watch-ad-button"
                style={{
                  minHeight: 44,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: isOnCooldown || !isAdReady ? colors.border : colors.primary + '99',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: isOnCooldown || !isAdReady ? 0.6 : 1,
                }}
              >
                {isWatchingAd ? (
                  <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
                ) : (
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: isOnCooldown || !isAdReady ? colors.textMuted : colors.primary }}
                  >
                    {isOnCooldown
                      ? t('profile.points_rewarded_cooldown', { hours: cooldownHoursLeft })
                      : !isAdReady
                      ? t('profile.points_watch_ad_loading')
                      : t('profile.points_watch_ad')}
                  </Text>
                )}
              </Pressable>
            )}
          </View>
        </View>

        {/* Banner de suscripción premium — visible solo cuando FEATURES.premium está activo */}
        {FEATURES.premium && isAuthenticated && <PremiumBanner />}

        {/* Rachas conseguidas — badges de hitos */}
        {(user.streakDays ?? 0) >= 7 && (
          <View className="px-6 mb-4">
            <Text className="text-gray-300 text-sm font-semibold mb-3 uppercase tracking-wider">
              {t('profile.streak_badges_section')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {(user.streakDays ?? 0) >= 7 && (
                <View
                  className="bg-orange-900/40 border border-orange-500/50 rounded-full px-3 py-1.5"
                  accessible
                  accessibilityLabel={`Racha de 7 días conseguida`}
                >
                  <Text className="text-orange-300 text-xs font-semibold">🔥 {t('profile.streak_badge_week')}</Text>
                </View>
              )}
              {(user.streakDays ?? 0) >= 30 && (
                <View
                  className="bg-amber-900/40 border border-amber-500/50 rounded-full px-3 py-1.5"
                  accessible
                  accessibilityLabel={`Racha de 30 días conseguida`}
                >
                  <Text className="text-amber-300 text-xs font-semibold">🔥 {t('profile.streak_badge_month')}</Text>
                </View>
              )}
              {(user.streakDays ?? 0) >= 100 && (
                <View
                  className="bg-yellow-900/40 border border-yellow-500/50 rounded-full px-3 py-1.5"
                  accessible
                  accessibilityLabel={`Racha de 100 días conseguida`}
                >
                  <Text className="text-yellow-300 text-xs font-semibold">⭐ {t('profile.streak_badge_century')}</Text>
                </View>
              )}
              {(user.streakDays ?? 0) >= 365 && (
                <View
                  className="bg-purple-900/40 border border-purple-500/50 rounded-full px-3 py-1.5"
                  accessible
                  accessibilityLabel={`Racha de 365 días conseguida`}
                >
                  <Text className="text-purple-300 text-xs font-semibold">👑 {t('profile.streak_badge_year')}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Estadísticas avanzadas (F1) — premium-only con paywall para usuarios free */}
        {FEATURES.advancedStats && (
          <View className="px-6 mb-4">
            <Text className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: colors.textSecondary }}>
              {t('profile.advanced_stats_section')}
            </Text>

            {user.isPremium ? (
              statsLoading ? (
                <SkeletonBox width={'100%'} height={140} borderRadius={12} />
              ) : statsData ? (
                <View className="gap-2">
                  {/* Grid 2×2 de métricas principales */}
                  <View className="flex-row gap-2">
                    <View className="flex-1 rounded-xl p-3" style={{ backgroundColor: colors.surface }}>
                      <Text className="text-base font-bold" style={{ color: colors.text }}>
                        {formatNumber(statsData.totalXp ?? 0, i18n.language)}
                      </Text>
                      <Text className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                        {t('profile.stats_total_xp')}
                      </Text>
                    </View>
                    <View className="flex-1 rounded-xl p-3" style={{ backgroundColor: colors.surface }}>
                      <Text className="text-base font-bold" style={{ color: colors.text }}>
                        {formatNumber(statsData.totalAchievements ?? 0, i18n.language)}
                      </Text>
                      <Text className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                        {t('profile.stats_total_achievements')}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row gap-2">
                    <View className="flex-1 rounded-xl p-3" style={{ backgroundColor: colors.surface }}>
                      <Text className="text-base font-bold" style={{ color: colors.text }}>
                        {statsData.completedGames}
                      </Text>
                      <Text className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                        {t('profile.stats_completed_games')}
                      </Text>
                    </View>
                    <View className="flex-1 rounded-xl p-3" style={{ backgroundColor: colors.surface }}>
                      <Text className="text-base font-bold" style={{ color: colors.text }}>
                        {statsData.bestStreak} 🔥
                      </Text>
                      <Text className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                        {t('profile.stats_best_streak')}
                      </Text>
                    </View>
                  </View>

                  {/* Plataforma favorita */}
                  {statsData.favoritePlatform && (
                    <View className="rounded-xl px-4 py-3 flex-row items-center justify-between" style={{ backgroundColor: colors.surface }}>
                      <Text className="text-sm" style={{ color: colors.textSecondary }}>
                        {t('profile.stats_favorite_platform')}
                      </Text>
                      <Text className="font-semibold text-sm" style={{ color: colors.text }}>
                        {PLATFORM_LABELS[statsData.favoritePlatform] ?? statsData.favoritePlatform}
                      </Text>
                    </View>
                  )}

                  {/* Logro más raro */}
                  {statsData.rarestAchievement && (
                    <View className="rounded-xl px-4 py-3 flex-row items-center" style={{ backgroundColor: colors.surface }}>
                      <Image
                        source={
                          statsData.rarestAchievement.iconUrl ??
                          require('../../assets/images/icon.png')
                        }
                        style={{ width: 36, height: 36, borderRadius: 6 }}
                        contentFit="cover"
                        accessibilityElementsHidden
                      />
                      <View className="flex-1 ml-3">
                        <Text className="text-xs" style={{ color: colors.textSecondary }}>
                          {t('profile.stats_rarest_achievement')}
                        </Text>
                        <Text className="text-sm font-semibold" style={{ color: colors.text }} numberOfLines={1}>
                          {statsData.rarestAchievement.title}
                        </Text>
                      </View>
                      <Text className="text-xs ml-2" style={{ color: colors.textMuted }}>
                        {t('profile.stats_rarity_pct', {
                          pct: statsData.rarestAchievement.rarity.toFixed(1),
                        })}
                      </Text>
                    </View>
                  )}
                </View>
              ) : null
            ) : (
              /* Paywall para usuarios free */
              <View className="rounded-2xl px-5 py-6 items-center" style={{ backgroundColor: colors.surface }}>
                <Text className="text-3xl mb-3">📊</Text>
                <Text className="text-sm font-semibold text-center mb-2" style={{ color: colors.text }}>
                  {t('profile.advanced_stats_section')}
                </Text>
                <Text className="text-xs text-center mb-4" style={{ color: colors.textSecondary }}>
                  {t('profile.advanced_stats_locked')}
                </Text>
                <Pressable
                  onPress={() => router.push('/premium')}
                  className="bg-primary rounded-xl px-6 py-2.5"
                  accessibilityRole="button"
                  accessibilityLabel={t('profile.advanced_stats_premium_cta')}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <Text className="font-semibold text-sm" style={{ color: '#ffffff' }}>
                    {t('profile.advanced_stats_premium_cta')}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Gaming Wrapped — solo cuando FEATURES.wrapped está activo */}
        {FEATURES.wrapped && (() => {
          const years = getWrappedYears();
          if (years.length === 0) return null;
          return (
            <View className="px-6 mb-4">
              <Text className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                {t('wrapped.section_title')}
              </Text>
              {years.map((y) => (
                <Pressable
                  key={y}
                  className="flex-row items-center justify-between rounded-xl px-4 py-3 mb-2 active:opacity-80"
                  style={{ minHeight: 52, backgroundColor: colors.surface }}
                  onPress={() => router.push(`/wrapped/${y}`)}
                  accessibilityRole="button"
                  accessibilityLabel={t('wrapped.open_year', { year: y })}
                >
                  <Text className="font-semibold" style={{ color: colors.text }}>Gaming Wrapped {y}</Text>
                  <Text className="text-lg" style={{ color: colors.textSecondary }}>›</Text>
                </Pressable>
              ))}
            </View>
          );
        })()}

        {/* Ajustes */}
        <View className="px-6 mb-6">
          <Text className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: colors.textSecondary }}>
            {t('profile.settings_section')}
          </Text>

          {/* Privacidad del perfil */}
          <View className="rounded-xl px-4 py-3 mb-2" style={{ backgroundColor: colors.surface }} testID="privacy-selector">
            <Text className="text-xs mb-2" style={{ color: colors.textSecondary }}>{t('profile.privacy_title')}</Text>
            <View className="flex-row gap-2">
              {(['PUBLIC', 'FRIENDS_ONLY', 'PRIVATE'] as const).map((option) => {
                const labelKey = option === 'PUBLIC'
                  ? 'profile.privacy_public'
                  : option === 'FRIENDS_ONLY'
                  ? 'profile.privacy_friends'
                  : 'profile.privacy_private';
                const currentVisibility = user.profileVisibility ?? 'PUBLIC';
                const isSelected = currentVisibility === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => {
                      if (!isSelected && !privacyMutation.isPending) {
                        privacyMutation.mutate(option);
                      }
                    }}
                    className="flex-1 py-2 rounded-lg items-center"
                    style={{ backgroundColor: isSelected ? colors.primary : colors.surfaceCard, minHeight: 36, opacity: privacyMutation.isPending && !isSelected ? 0.5 : 1 }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected, disabled: privacyMutation.isPending }}
                    accessibilityLabel={t(labelKey)}
                    testID={`privacy-option-${option.toLowerCase()}`}
                  >
                    <Text className="text-xs font-semibold" style={{ color: isSelected ? '#ffffff' : colors.textSecondary }}>
                      {privacyMutation.isPending && isSelected
                        ? t('profile.privacy_saving')
                        : t(labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Idioma */}
          <View className="rounded-xl px-4 py-3 mb-2" style={{ backgroundColor: colors.surface }}>
            <Text className="text-xs mb-2" style={{ color: colors.textSecondary }}>{t('profile.settings_language')}</Text>
            <View className="flex-row gap-2">
              {(['es', 'en'] as const).map((lang) => (
                <Pressable
                  key={lang}
                  onPress={() => changeLanguage(lang)}
                  className="flex-1 py-2 rounded-lg items-center"
                  style={{ backgroundColor: currentLanguage === lang ? colors.primary : colors.surfaceCard, minHeight: 36 }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: currentLanguage === lang }}
                  accessibilityLabel={lang === 'es' ? 'Español' : 'English'}
                >
                  <Text className="text-sm font-semibold" style={{ color: currentLanguage === lang ? '#ffffff' : colors.textSecondary }}>
                    {lang === 'es' ? '🇪🇸 Español' : '🇬🇧 English'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Selector de tema */}
          <View className="rounded-xl px-4 py-3 mb-2" style={{ backgroundColor: colors.surface }} testID="theme-selector">
            <Text className="text-xs mb-2" style={{ color: colors.textSecondary }}>{t('profile.settings_theme')}</Text>
            <View className="flex-row gap-2">
              {(['dark', 'light'] as const).map((themeOption: ThemePreference) => {
                const isSelected = currentTheme === themeOption;
                const label = themeOption === 'dark' ? t('profile.theme_dark') : t('profile.theme_light');
                return (
                  <Pressable
                    key={themeOption}
                    onPress={() => setTheme(themeOption)}
                    className="flex-1 py-2 rounded-lg items-center"
                    style={{ backgroundColor: isSelected ? colors.primary : colors.surfaceCard, minHeight: 36 }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={label}
                    testID={`theme-option-${themeOption}`}
                  >
                    <Text className="text-sm font-semibold" style={{ color: isSelected ? '#ffffff' : colors.textSecondary }}>
                      {themeOption === 'dark' ? `🌙 ${label}` : `☀️ ${label}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Versión de la app */}
          <Text
            className="text-xs text-center mt-2"
            style={{ color: colors.textMuted }}
            accessibilityElementsHidden
            testID="app-version"
          >
            {t('profile.app_version', { version: APP_VERSION, build: APP_BUILD })}
          </Text>
        </View>

        {/* Actividad reciente */}
        {(events.length > 0 || isFeedError) && (
          <View className="px-6 mb-6">
            <Text className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: colors.textSecondary }}>
              {t('profile.recent_activity')}
            </Text>
            {isFeedError ? (
              <View
                className="rounded-xl px-4 py-5 items-center"
                style={{ backgroundColor: colors.surface }}
                accessible
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                <Text className="text-red-400 text-sm font-semibold mb-1">
                  {t('feed.error_title')}
                </Text>
                <Text className="text-xs text-center mb-4" style={{ color: colors.textSecondary }}>
                  {t('feed.error_message')}
                </Text>
                <Pressable
                  onPress={() => void refetchFeed()}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.retry')}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <Text className="text-primary-light text-sm font-medium">
                    {t('common.retry')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              events.slice(0, 5).map((event) => (
                <ActivityCard key={event.id} event={event} />
              ))
            )}
          </View>
        )}

        {/* Botón cerrar sesión */}
        <View className="px-6">
          <Pressable
            className="w-full border border-red-500/60 rounded-xl py-4 items-center active:opacity-80"
            onPress={handleLogout}
            disabled={isLoggingOut}
            accessibilityRole="button"
            accessibilityLabel={t('profile.logout')}
            accessibilityHint={t('profile.logout_hint')}
            accessibilityState={{ disabled: isLoggingOut, busy: isLoggingOut }}
            style={{ minHeight: 52 }}
          >
            <Text className="text-red-400 font-semibold text-base">
              {isLoggingOut ? t('profile.logging_out') : t('profile.logout')}
            </Text>
          </Pressable>
        </View>

        {/* Zona de peligro — eliminar cuenta */}
        <View className="px-6 mt-6 mb-2">
          <Text className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: colors.textMuted }}>
            {t('profile.danger_zone')}
          </Text>
          <Pressable
            className="w-full border border-red-800/60 rounded-xl py-4 items-center active:opacity-80"
            onPress={handleDeleteAccount}
            disabled={deleteAccountMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel={t('profile.delete_account')}
            accessibilityHint={t('profile.delete_account_hint')}
            accessibilityState={{ disabled: deleteAccountMutation.isPending, busy: deleteAccountMutation.isPending }}
            style={{ minHeight: 52 }}
          >
            <Text className="text-red-700 font-semibold text-base">
              {deleteAccountMutation.isPending
                ? t('profile.deleting_account')
                : t('profile.delete_account')}
            </Text>
          </Pressable>
        </View>

        {/* Enlace a la política de privacidad — requerido por Google Play y RGPD */}
        <View className="px-6 mt-4 mb-2 items-center">
          <Pressable
            onPress={() => router.push('/privacy')}
            accessibilityRole="link"
            accessibilityLabel={t('privacy.link_label')}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text className="text-sm" style={{ color: colors.textMuted }}>{t('privacy.link_label')}</Text>
          </Pressable>
        </View>
      </ScrollView>
      )}
    </SafeAreaView>
  );
}
