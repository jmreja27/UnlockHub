// Pantalla de perfil de usuario: avatar, stats, plataformas y logout
import { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { useSessionStore } from '../../stores/sessionStore';
import { useAuth } from '../../hooks/useAuth';
import { SkeletonBox } from '../../components/SkeletonBox';
import { PremiumBanner } from '../../components/PremiumBanner';
import { FEATURES } from '../../lib/featureFlags';
import { api } from '../../lib/api';
import type { PlatformAccount } from '@unlockhub/types';

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

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { user, isAuthenticated } = useSessionStore();
  const { logout, isLoggingOut } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Obtiene las plataformas vinculadas del usuario
  const queryClient = useQueryClient();

  const {
    data: platforms,
    isLoading: isLoadingPlatforms,
    refetch: refetchPlatforms,
  } = useQuery({
    queryKey: ['platforms', user?.id],
    queryFn: () => api.get<PlatformAccount[]>('/api/v1/users/me/platforms'),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  const unlinkMutation = useMutation({
    mutationFn: (platform: string) =>
      api.delete(`/api/v1/platforms/${platform.toLowerCase()}/unlink`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platforms', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['linkedPlatforms'] });
    },
  });

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
      await refetchPlatforms();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchPlatforms]);

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

  // Estado no autenticado
  if (!isAuthenticated || !user) {
    return (
      <SafeAreaView className="flex-1 bg-surface">
        <View className="flex-1 items-center justify-center px-6">
          <Text
            className="text-white text-2xl font-bold mb-3 text-center"
            accessibilityRole="header"
          >
            {t('profile.title')}
          </Text>
          <Text className="text-gray-400 text-base text-center mb-8">
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
            <Text className="text-white font-semibold text-base">{t('profile.login')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Estado de carga inicial
  if (isLoadingPlatforms && !platforms) {
    return (
      <SafeAreaView className="flex-1 bg-surface">
        <ProfileSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
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
        {/* Sección de avatar y datos principales */}
        <View
          className="items-center pt-8 pb-6 px-6"
          accessible
          accessibilityLabel={t('profile.profile_aria', {
            username: user.username,
            level: user.level,
            xp: user.xp.toLocaleString(),
          })}
        >
          <Image
            source={user.avatar ?? undefined}
            placeholder={AVATAR_BLURHASH}
            style={{ width: 96, height: 96, borderRadius: 48, marginBottom: 12 }}
            contentFit="cover"
            transition={300}
            accessibilityElementsHidden
          />

          <Text className="text-white text-2xl font-bold mb-1">{user.username}</Text>

          {user.bio && (
            <Text className="text-gray-400 text-sm text-center mt-1 mb-2">{user.bio}</Text>
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
          className="flex-row mx-6 mb-6 bg-surface-elevated rounded-2xl py-4"
          accessible
          accessibilityLabel={t('profile.stats_aria', {
            level: user.level,
            xp: user.xp.toLocaleString(),
            streak: user.streakDays,
          })}
        >
          <View className="flex-1 items-center">
            <Text className="text-white text-xl font-bold">{user.level}</Text>
            <Text className="text-gray-400 text-xs mt-1">{t('profile.stat_level')}</Text>
          </View>
          <View className="w-px bg-surface-card" />
          <View className="flex-1 items-center">
            <Text className="text-white text-xl font-bold">{user.xp.toLocaleString()}</Text>
            <Text className="text-gray-400 text-xs mt-1">{t('profile.stat_xp')}</Text>
          </View>
          <View className="w-px bg-surface-card" />
          <View className="flex-1 items-center">
            <Text className="text-white text-xl font-bold">{user.streakDays}</Text>
            <Text className="text-gray-400 text-xs mt-1">{t('profile.stat_streak')}</Text>
          </View>
        </View>

        {/* Plataformas vinculadas */}
        <View className="px-6 mb-6">
          <Text className="text-gray-300 text-sm font-semibold mb-3 uppercase tracking-wider">
            {t('profile.platforms_section')}
          </Text>

          {platforms && platforms.length > 0 ? (
            platforms.map((account) => {
              const canUnlink = account.platform === 'PSN' || account.platform === 'XBOX';
              const label = PLATFORM_LABELS[account.platform] ?? account.platform;
              return (
                <View
                  key={account.id}
                  className="flex-row items-center bg-surface-elevated rounded-xl px-4 py-3 mb-2"
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
                    <Text className="text-white font-semibold text-sm">{label}</Text>
                    <Text className="text-gray-400 text-xs mt-0.5">{account.username}</Text>
                  </View>
                  {account.lastSyncedAt && (
                    <Text className="text-gray-500 text-xs mr-2">
                      {t('profile.sync_prefix')} {new Date(account.lastSyncedAt).toLocaleDateString()}
                    </Text>
                  )}
                  {canUnlink && (
                    <Pressable
                      onPress={() => handleUnlink(account.platform, label)}
                      accessibilityRole="button"
                      accessibilityLabel={
                        account.platform === 'PSN'
                          ? t('link_platform.psn.unlink')
                          : t('link_platform.xbox.unlink')
                      }
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
              className="bg-surface-elevated rounded-xl px-4 py-6 items-center"
              accessible
              accessibilityLiveRegion="polite"
            >
              <Text className="text-gray-400 text-sm text-center">
                {t('profile.platforms_empty')}
              </Text>
            </View>
          )}

          {/* Botones para vincular PSN / Xbox si aún no están vinculados */}
          {(() => {
            const linked = new Set(platforms?.map((p) => p.platform) ?? []);
            return (
              <View className="mt-2 gap-2">
                {!linked.has('PSN') && (
                  <Pressable
                    onPress={() => router.push('/link-platform/psn')}
                    accessibilityRole="button"
                    accessibilityLabel={t('link_platform.psn.submit_label')}
                    className="flex-row items-center bg-surface-elevated border border-[#003791]/60 rounded-xl px-4 py-3 active:opacity-80"
                    style={{ minHeight: 52 }}
                  >
                    <View
                      style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#003791', marginRight: 12 }}
                      accessibilityElementsHidden
                    />
                    <Text className="text-white font-semibold text-sm flex-1">
                      {t('link_platform.psn.submit')}
                    </Text>
                    <Text className="text-gray-400 text-lg">›</Text>
                  </Pressable>
                )}
                {!linked.has('XBOX') && (
                  <Pressable
                    onPress={() => router.push('/link-platform/xbox')}
                    accessibilityRole="button"
                    accessibilityLabel={t('link_platform.xbox.submit_label')}
                    className="flex-row items-center bg-surface-elevated border border-[#107c10]/60 rounded-xl px-4 py-3 active:opacity-80"
                    style={{ minHeight: 52 }}
                  >
                    <View
                      style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#107c10', marginRight: 12 }}
                      accessibilityElementsHidden
                    />
                    <Text className="text-white font-semibold text-sm flex-1">
                      {t('link_platform.xbox.submit')}
                    </Text>
                    <Text className="text-gray-400 text-lg">›</Text>
                  </Pressable>
                )}
              </View>
            );
          })()}
        </View>

        {/* Banner de suscripción premium — visible solo cuando FEATURES.premium está activo */}
        {FEATURES.premium && isAuthenticated && <PremiumBanner />}

        {/* Gaming Wrapped — accesible en diciembre (año actual) y siempre para años pasados */}
        {(() => {
          const years = getWrappedYears();
          if (years.length === 0) return null;
          return (
            <View className="px-6 mb-4">
              <Text className="text-gray-300 text-sm font-semibold mb-3 uppercase tracking-wider">
                {t('wrapped.section_title')}
              </Text>
              {years.map((y) => (
                <Pressable
                  key={y}
                  className="flex-row items-center justify-between bg-surface-elevated rounded-xl px-4 py-3 mb-2 active:opacity-80"
                  onPress={() => router.push(`/wrapped/${y}`)}
                  accessibilityRole="button"
                  accessibilityLabel={t('wrapped.open_year', { year: y })}
                  style={{ minHeight: 52 }}
                >
                  <Text className="text-white font-semibold">Gaming Wrapped {y}</Text>
                  <Text className="text-gray-400 text-lg">›</Text>
                </Pressable>
              ))}
            </View>
          );
        })()}

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

        {/* Enlace a la política de privacidad — requerido por Google Play y RGPD */}
        <View className="px-6 mt-4 mb-2 items-center">
          <Pressable
            onPress={() => router.push('/privacy')}
            accessibilityRole="link"
            accessibilityLabel={t('privacy.link_label')}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text className="text-gray-500 text-sm">{t('privacy.link_label')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
