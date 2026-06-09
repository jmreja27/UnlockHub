import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlashList } from '@shopify/flash-list';

import { useUserGameAchievements } from '../../../hooks/useUserGames';
import { useSessionStore } from '../../../stores/sessionStore';
import { SkeletonBox } from '../../../components/SkeletonBox';
import { getPlatformColor } from '../../../lib/platformColors';
import type { UserGameAchievement } from '../../../hooks/useUserGames';

type ViewMode = 'their' | 'compare';

// ── Fila de logro (modo "Sus logros") ─────────────────────────────────────────

function AchievementRow({ achievement }: { achievement: UserGameAchievement }) {
  const { t } = useTranslation();
  const isUnlocked = achievement.isUnlocked;

  return (
    <View
      className="flex-row items-center px-4 py-3 border-b border-gray-800"
      accessible
      accessibilityLabel={`${achievement.title}${isUnlocked ? `, ${t('user_game.unlocked')}` : `, ${t('user_game.locked')}`}`}
    >
      <Image
        source={achievement.iconUrl ?? require('../../../assets/images/icon.png')}
        style={{
          width: 40,
          height: 40,
          borderRadius: 6,
          backgroundColor: '#1e293b',
          opacity: isUnlocked ? 1 : 0.35,
        }}
        contentFit="contain"
        accessibilityElementsHidden
      />
      <View className="flex-1 ml-3">
        <Text
          className={`text-sm font-semibold ${isUnlocked ? 'text-white' : 'text-gray-500'}`}
          numberOfLines={1}
        >
          {achievement.title}
        </Text>
        {achievement.description ? (
          <Text className="text-gray-500 text-xs mt-0.5" numberOfLines={2}>
            {achievement.description}
          </Text>
        ) : null}
        <Text className="text-gray-600 text-xs mt-0.5">
          {achievement.normalizedPoints} XP
          {achievement.rarity != null
            ? ` · ${(achievement.rarity * 100).toFixed(1)}%`
            : ''}
        </Text>
      </View>
      <View
        className={`w-6 h-6 rounded-full items-center justify-center ml-2 ${isUnlocked ? 'bg-green-600' : 'bg-gray-700'}`}
        accessibilityElementsHidden
      >
        <Text className="text-xs text-white">{isUnlocked ? '✓' : '○'}</Text>
      </View>
    </View>
  );
}

// ── Fila de logro (modo "Comparar") ───────────────────────────────────────────

function CompareRow({
  achievement,
  username,
}: {
  achievement: UserGameAchievement;
  username: string;
}) {
  const { t } = useTranslation();

  const check = (unlocked: boolean) => (
    <View
      className={`w-7 h-7 rounded-full items-center justify-center ${unlocked ? 'bg-green-600' : 'bg-gray-700'}`}
      accessibilityElementsHidden
    >
      <Text className="text-xs text-white">{unlocked ? '✓' : '○'}</Text>
    </View>
  );

  return (
    <View
      className="flex-row items-center px-4 py-3 border-b border-gray-800"
      accessible
      accessibilityLabel={`${achievement.title}: ${t('user_game.you')} ${achievement.isUnlockedByMe ? t('user_game.unlocked') : t('user_game.locked')}, ${username} ${achievement.isUnlocked ? t('user_game.unlocked') : t('user_game.locked')}`}
    >
      {/* Columna Yo */}
      <View className="w-9 items-center">
        {check(achievement.isUnlockedByMe === true)}
      </View>

      {/* Nombre del logro */}
      <View className="flex-1 mx-3">
        <Text className="text-white text-sm font-semibold" numberOfLines={1}>
          {achievement.title}
        </Text>
        <Text className="text-gray-500 text-xs mt-0.5">
          {achievement.normalizedPoints} XP
        </Text>
      </View>

      {/* Columna Ellos */}
      <View className="w-9 items-center">
        {check(achievement.isUnlocked)}
      </View>
    </View>
  );
}

// ── Pantalla principal ─────────────────────────────────────────────────────────

export default function UserGameScreen() {
  const { username, gameId } = useLocalSearchParams<{ username: string; gameId: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);

  const [mode, setMode] = useState<ViewMode>('their');

  const { data, isLoading, isError } = useUserGameAchievements(
    username ?? '',
    gameId ?? '',
  );

  if (!username || !gameId) return null;

  const platformColor = data ? getPlatformColor(data.game.platform) : '#6366f1';

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
      {/* Back */}
      <Pressable
        onPress={() => router.back()}
        className="px-4 pt-3 pb-1"
        accessibilityLabel={t('common.back')}
        accessibilityRole="button"
        style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
      >
        <Text className="text-indigo-400 text-base">{t('common.back')}</Text>
      </Pressable>

      {isLoading ? (
        <View className="px-4 pt-4" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <SkeletonBox height={60} borderRadius={12} />
          <SkeletonBox height={40} style={{ marginTop: 12 }} borderRadius={8} />
          {[0, 1, 2, 3, 4].map((i) => (
            <SkeletonBox key={i} height={60} style={{ marginTop: 8 }} borderRadius={8} />
          ))}
        </View>
      ) : isError || !data ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text
            className="text-white text-lg font-semibold text-center"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {t('common.error_generic')}
          </Text>
        </View>
      ) : (
        <>
          {/* Header — icono + título + progreso */}
          <View className="flex-row items-center px-4 py-3 bg-surface-elevated mx-4 mt-2 rounded-2xl">
            <Image
              source={data.game.iconUrl ?? require('../../../assets/images/icon.png')}
              style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: '#1e293b' }}
              contentFit="contain"
              accessibilityElementsHidden
            />
            <View className="flex-1 ml-3">
              <Text
                className="text-white font-bold text-base"
                numberOfLines={1}
                accessibilityRole="header"
              >
                {data.game.title}
              </Text>
              <Text className="text-gray-400 text-xs mt-0.5">
                {data.game.earnedAchievements}/{data.game.totalAchievements}{' '}
                {t('library.achievements_short')} · {data.game.completionPct}%
              </Text>
              {/* Barra de progreso */}
              <View className="h-1.5 bg-surface rounded-full overflow-hidden mt-1.5" accessibilityElementsHidden>
                <View
                  style={{
                    width: `${data.game.completionPct}%`,
                    backgroundColor: platformColor,
                    height: '100%',
                    borderRadius: 9999,
                  }}
                />
              </View>
            </View>
          </View>

          {/* Toggle de modo — solo si hay sesión (canCompare) */}
          {isAuthenticated && (
            <View className="flex-row mx-4 mt-3 bg-surface-card rounded-xl overflow-hidden">
              <Pressable
                onPress={() => setMode('their')}
                className={`flex-1 py-2.5 items-center ${mode === 'their' ? 'bg-indigo-600' : ''}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === 'their' }}
                testID="tab-their"
              >
                <Text className={`text-sm font-semibold ${mode === 'their' ? 'text-white' : 'text-gray-400'}`}>
                  {t('user_game.their_achievements')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMode('compare')}
                className={`flex-1 py-2.5 items-center ${mode === 'compare' ? 'bg-indigo-600' : ''}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === 'compare' }}
                testID="tab-compare"
              >
                <Text className={`text-sm font-semibold ${mode === 'compare' ? 'text-white' : 'text-gray-400'}`}>
                  {t('user_game.compare')}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Cabecera columnas en modo comparación */}
          {mode === 'compare' && isAuthenticated && (
            <View className="flex-row items-center px-4 pt-3 pb-1">
              <View className="w-9 items-center">
                <Text className="text-gray-400 text-xs font-semibold uppercase">
                  {t('user_game.you')}
                </Text>
              </View>
              <View className="flex-1 mx-3" />
              <View className="w-9 items-center">
                <Text className="text-gray-400 text-xs font-semibold uppercase" numberOfLines={1}>
                  {username}
                </Text>
              </View>
            </View>
          )}

          {/* Lista de logros */}
          <FlashList
            data={data.achievements}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) =>
              mode === 'compare' && isAuthenticated ? (
                <CompareRow achievement={item} username={username ?? ''} />
              ) : (
                <AchievementRow achievement={item} />
              )
            }
            contentContainerStyle={{ paddingBottom: 32 }}
            accessibilityLabel={t('user_game.their_achievements')}
          />
        </>
      )}
    </SafeAreaView>
  );
}
