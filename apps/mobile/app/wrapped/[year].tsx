import { View, Text, ScrollView, Share, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { GamingWrapped } from '@unlockhub/types';

import { useWrapped } from '../../hooks/useWrapped';
import { useWrappedInterstitial } from '../../hooks/useWrappedInterstitial';
import { analytics } from '../../lib/analytics';
import { formatDayMonth, MONTH_NAMES } from '../../lib/formatTimeAgo';

const PLATFORM_LABELS: Record<string, string> = {
  STEAM: 'Steam',
  RA: 'RetroAchievements',
  XBOX: 'Xbox',
  PSN: 'PlayStation',
};

function StatCard({
  label,
  value,
  sub,
  delay,
}: {
  label: string;
  value: string;
  sub?: string;
  delay: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(400)}
      className="bg-surface-elevated rounded-2xl p-4 mb-3"
      accessible
      accessibilityLabel={`${label}: ${value}${sub ? `, ${sub}` : ''}`}
    >
      <Text className="text-gray-400 text-xs uppercase tracking-wider mb-1">{label}</Text>
      <Text className="text-white text-2xl font-bold">{value}</Text>
      {sub && <Text className="text-gray-400 text-sm mt-1">{sub}</Text>}
    </Animated.View>
  );
}

function ComparisonBadge({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (previous === 0) return null;
  const diff = current - previous;
  const pct = Math.round(Math.abs(diff / previous) * 100);
  const isUp = diff >= 0;

  return (
    <View
      className={`flex-row items-center self-start px-2 py-1 rounded-full mt-1 ${isUp ? 'bg-green-900/50' : 'bg-red-900/50'}`}
      accessible
      accessibilityLabel={`${isUp ? '+' : '-'}${pct}% ${label} vs año anterior`}
    >
      <Text className={`text-xs font-semibold ${isUp ? 'text-green-400' : 'text-red-400'}`}>
        {isUp ? '↑' : '↓'} {pct}% vs {label}
      </Text>
    </View>
  );
}

function buildShareText(wrapped: GamingWrapped, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const lines = [
    t('wrapped.share_header', { year: wrapped.year }),
    `🏆 ${t('wrapped.total_achievements')}: ${wrapped.totalAchievements}`,
    `⭐ ${t('wrapped.total_xp')}: ${wrapped.totalXpGained.toLocaleString()} XP`,
  ];
  if (wrapped.topGame) {
    lines.push(`🎮 ${t('wrapped.top_game')}: ${wrapped.topGame.title} (${wrapped.topGame.achievementsCount})`);
  }
  if (wrapped.rarestAchievement) {
    lines.push(
      `💎 ${t('wrapped.rarest')}: ${wrapped.rarestAchievement.title} (${wrapped.rarestAchievement.rarity?.toFixed(1) ?? '?'}%)`,
    );
  }
  if (wrapped.bestStreak > 0) {
    lines.push(`🔥 ${t('wrapped.best_streak')}: ${wrapped.bestStreak} ${t('wrapped.days')}`);
  }
  if ((wrapped.platinumsEarned ?? 0) > 0) {
    lines.push(`🏅 ${t('wrapped.platinums_earned')}: ${wrapped.platinumsEarned}`);
  }
  if ((wrapped.longestStreakInYear ?? 0) > 1) {
    lines.push(`⚡ ${t('wrapped.longest_streak')}: ${wrapped.longestStreakInYear} ${t('wrapped.days')}`);
  }
  lines.push('\n#UnlockHub #GamingWrapped');
  return lines.join('\n');
}

// Parsea el param que puede ser "2025" (anual) o "2025-01" (mensual)
function parsePeriod(raw: string): { year: number; month: number | undefined; isMonthly: boolean } {
  const monthlyMatch = /^(\d{4})-(\d{2})$/.exec(raw);
  if (monthlyMatch) {
    const year = parseInt(monthlyMatch[1]!, 10);
    const month = parseInt(monthlyMatch[2]!, 10);
    if (!isNaN(year) && month >= 1 && month <= 12) {
      return { year, month, isMonthly: true };
    }
  }
  const year = parseInt(raw, 10);
  return { year, month: undefined, isMonthly: false };
}


export default function WrappedScreen() {
  const { year: periodParam } = useLocalSearchParams<{ year: string }>();
  const { year, month, isMonthly } = parsePeriod(periodParam ?? '');
  const { t, i18n } = useTranslation();

  const period = isMonthly ? `${year}-${String(month ?? 1).padStart(2, '0')}` : String(year);
  const { data: wrapped, isLoading, isError } = useWrapped(isMonthly ? period : year);

  useWrappedInterstitial();

  const monthNames = MONTH_NAMES[i18n.language] ?? MONTH_NAMES['en']!;
  const periodLabel = isMonthly
    ? `${monthNames[(month ?? 1) - 1]} ${year}`
    : String(year);

  function handleShare() {
    if (!wrapped) return;
    void analytics.wrappedShared(period);
    Share.share({ message: buildShareText(wrapped, t) }).catch(() => undefined);
  }

  if (isNaN(year) || (isMonthly && (month === undefined || month < 1 || month > 12))) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center px-6">
        <Text className="text-white text-lg font-bold text-center" accessibilityRole="alert">
          {t('wrapped.invalid_year')}
        </Text>
        <Pressable
          className="mt-6 px-6 py-3 bg-primary rounded-xl"
          onPress={() => router.back()}
          accessibilityRole="button"
        >
          <Text className="text-white font-semibold">{t('common.back')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Cabecera */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-800">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          className="p-1"
          style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}
        >
          <Text className="text-primary-light text-base">{t('common.back')}</Text>
        </Pressable>

        <Text className="text-white text-lg font-bold" accessibilityRole="header">
          {t('wrapped.title', { year: periodLabel })}
        </Text>

        <Pressable
          onPress={handleShare}
          disabled={!wrapped}
          accessibilityRole="button"
          accessibilityLabel={t('wrapped.share')}
          accessibilityState={{ disabled: !wrapped }}
          className="p-1"
          style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' }}
        >
          <Text className={`text-base font-semibold ${wrapped ? 'text-primary-light' : 'text-gray-600'}`}>
            {t('wrapped.share')}
          </Text>
        </Pressable>
      </View>

      {/* Contenido */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#818cf8" size="large" accessibilityLabel={t('common.loading')} />
        </View>
      ) : isError || !wrapped ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text
            className="text-white text-lg font-bold text-center"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {t('wrapped.error_title')}
          </Text>
          <Text className="text-gray-400 text-sm mt-2 text-center">{t('wrapped.error_message')}</Text>
        </View>
      ) : wrapped.totalAchievements === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text
            className="text-gray-400 text-center text-base"
            accessibilityLiveRegion="polite"
          >
            {t('wrapped.empty', { year })}
          </Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 32 }}>
          {/* Subtítulo */}
          <Animated.View entering={FadeInDown.duration(300)} className="mb-5">
            <Text className="text-indigo-400 text-sm font-medium text-center">
              {t('wrapped.subtitle')}
            </Text>
          </Animated.View>

          {/* Logros totales */}
          <StatCard
            label={t('wrapped.total_achievements')}
            value={wrapped.totalAchievements.toString()}
            sub={
              wrapped.previousYear
                ? `${t('wrapped.vs_previous')}: ${wrapped.previousYear.totalAchievements}`
                : undefined
            }
            delay={0}
          />
          {wrapped.previousYear && (
            <ComparisonBadge
              current={wrapped.totalAchievements}
              previous={wrapped.previousYear.totalAchievements}
              label={t('wrapped.prev_year_short')}
            />
          )}

          {/* XP total */}
          <View className="mt-3">
            <StatCard
              label={t('wrapped.total_xp')}
              value={`${wrapped.totalXpGained.toLocaleString()} XP`}
              sub={
                wrapped.previousYear
                  ? `${t('wrapped.vs_previous')}: ${wrapped.previousYear.totalXpGained.toLocaleString()} XP`
                  : undefined
              }
              delay={100}
            />
            {wrapped.previousYear && (
              <ComparisonBadge
                current={wrapped.totalXpGained}
                previous={wrapped.previousYear.totalXpGained}
                label={t('wrapped.prev_year_short')}
              />
            )}
          </View>

          {/* Mejor racha */}
          {wrapped.bestStreak > 0 && (
            <View className="mt-3">
              <StatCard
                label={t('wrapped.best_streak')}
                value={`${wrapped.bestStreak} ${t('wrapped.days')}`}
                sub={
                  wrapped.previousYear && wrapped.previousYear.bestStreak > 0
                    ? `${t('wrapped.vs_previous')}: ${wrapped.previousYear.bestStreak} ${t('wrapped.days')}`
                    : undefined
                }
                delay={200}
              />
              {wrapped.previousYear && wrapped.previousYear.bestStreak > 0 && (
                <ComparisonBadge
                  current={wrapped.bestStreak}
                  previous={wrapped.previousYear.bestStreak}
                  label={t('wrapped.prev_year_short')}
                />
              )}
            </View>
          )}

          {/* Juego favorito */}
          {wrapped.topGame && (
            <Animated.View
              entering={FadeInDown.delay(300).duration(400)}
              className="bg-surface-elevated rounded-2xl p-4 mt-3"
              accessible
              accessibilityLabel={`${t('wrapped.top_game')}: ${wrapped.topGame.title}, ${wrapped.topGame.achievementsCount} logros en ${PLATFORM_LABELS[wrapped.topGame.platform] ?? wrapped.topGame.platform}`}
            >
              <Text className="text-gray-400 text-xs uppercase tracking-wider mb-2">
                {t('wrapped.top_game')}
              </Text>
              <View className="flex-row items-center">
                {wrapped.topGame.iconUrl ? (
                  <Image
                    source={wrapped.topGame.iconUrl}
                    style={{ width: 48, height: 48, borderRadius: 8, marginRight: 12 }}
                    contentFit="cover"
                    accessibilityElementsHidden
                  />
                ) : (
                  <View
                    style={{ width: 48, height: 48, borderRadius: 8, marginRight: 12 }}
                    className="bg-gray-700 items-center justify-center"
                    accessibilityElementsHidden
                  >
                    <Text className="text-gray-400 text-xl">🎮</Text>
                  </View>
                )}
                <View className="flex-1">
                  <Text className="text-white font-bold text-base" numberOfLines={2}>
                    {wrapped.topGame.title}
                  </Text>
                  <Text className="text-indigo-400 text-sm mt-0.5">
                    {wrapped.topGame.achievementsCount} {t('wrapped.achievements_in_game')}
                  </Text>
                  <Text className="text-gray-500 text-xs mt-0.5">
                    {PLATFORM_LABELS[wrapped.topGame.platform] ?? wrapped.topGame.platform}
                  </Text>
                </View>
              </View>
            </Animated.View>
          )}

          {/* Logro más raro */}
          {wrapped.rarestAchievement && (
            <Animated.View
              entering={FadeInDown.delay(400).duration(400)}
              className="bg-surface-elevated rounded-2xl p-4 mt-3"
              accessible
              accessibilityLabel={`${t('wrapped.rarest')}: ${wrapped.rarestAchievement.title}, ${wrapped.rarestAchievement.rarity?.toFixed(1) ?? '?'}% de jugadores`}
            >
              <Text className="text-gray-400 text-xs uppercase tracking-wider mb-2">
                {t('wrapped.rarest')}
              </Text>
              <View className="flex-row items-center">
                {wrapped.rarestAchievement.iconUrl ? (
                  <Image
                    source={wrapped.rarestAchievement.iconUrl}
                    style={{ width: 48, height: 48, borderRadius: 24, marginRight: 12 }}
                    contentFit="cover"
                    accessibilityElementsHidden
                  />
                ) : (
                  <View
                    style={{ width: 48, height: 48, borderRadius: 24, marginRight: 12 }}
                    className="bg-yellow-900/40 items-center justify-center"
                    accessibilityElementsHidden
                  >
                    <Text className="text-2xl">💎</Text>
                  </View>
                )}
                <View className="flex-1">
                  <Text className="text-white font-bold text-base" numberOfLines={2}>
                    {wrapped.rarestAchievement.title}
                  </Text>
                  <Text className="text-yellow-400 text-sm mt-0.5">
                    {wrapped.rarestAchievement.rarity?.toFixed(2) ?? '?'}% {t('wrapped.rarity_players')}
                  </Text>
                  <Text className="text-gray-500 text-xs mt-0.5" numberOfLines={1}>
                    {wrapped.rarestAchievement.gameName}
                  </Text>
                </View>
              </View>
            </Animated.View>
          )}

          {/* Estadísticas extendidas — solo en wrapped anual */}

          {/* Platinos PSN */}
          {(wrapped.platinumsEarned ?? 0) > 0 && (
            <View className="mt-3">
              <StatCard
                label={t('wrapped.platinums_earned')}
                value={String(wrapped.platinumsEarned)}
                sub={t('wrapped.platinums_sub')}
                delay={500}
              />
            </View>
          )}

          {/* Juegos completados al 100% por plataforma */}
          {wrapped.completedGamesByPlatform &&
            (wrapped.completedGamesByPlatform.steam +
              wrapped.completedGamesByPlatform.ra +
              wrapped.completedGamesByPlatform.psn) > 0 && (
            <Animated.View
              entering={FadeInDown.delay(550).duration(400)}
              className="bg-surface-elevated rounded-2xl p-4 mt-3"
              accessible
              accessibilityLabel={t('wrapped.completed_games_a11y', {
                steam: wrapped.completedGamesByPlatform.steam,
                ra: wrapped.completedGamesByPlatform.ra,
                psn: wrapped.completedGamesByPlatform.psn,
              })}
            >
              <Text className="text-gray-400 text-xs uppercase tracking-wider mb-2">
                {t('wrapped.completed_games_title')}
              </Text>
              <View className="flex-row gap-4">
                {wrapped.completedGamesByPlatform.steam > 0 && (
                  <View className="items-center">
                    <Text className="text-white font-bold text-2xl">
                      {wrapped.completedGamesByPlatform.steam}
                    </Text>
                    <Text className="text-gray-400 text-xs mt-0.5">Steam</Text>
                  </View>
                )}
                {wrapped.completedGamesByPlatform.ra > 0 && (
                  <View className="items-center">
                    <Text className="text-white font-bold text-2xl">
                      {wrapped.completedGamesByPlatform.ra}
                    </Text>
                    <Text className="text-gray-400 text-xs mt-0.5">RetroAch.</Text>
                  </View>
                )}
                {wrapped.completedGamesByPlatform.psn > 0 && (
                  <View className="items-center">
                    <Text className="text-white font-bold text-2xl">
                      {wrapped.completedGamesByPlatform.psn}
                    </Text>
                    <Text className="text-gray-400 text-xs mt-0.5">PlayStation</Text>
                  </View>
                )}
              </View>
            </Animated.View>
          )}

          {/* Racha más larga del año */}
          {(wrapped.longestStreakInYear ?? 0) > 1 && (
            <View className="mt-3">
              <StatCard
                label={t('wrapped.longest_streak')}
                value={`${wrapped.longestStreakInYear} ${t('wrapped.days')}`}
                delay={600}
              />
            </View>
          )}

          {/* Día más productivo */}
          {wrapped.mostProductiveDay && wrapped.mostProductiveDay.achievementsCount > 0 && (
            <View className="mt-3">
              <StatCard
                label={t('wrapped.most_productive_day')}
                value={formatDayMonth(wrapped.mostProductiveDay.date, i18n.language)}
                sub={t('wrapped.most_productive_count', {
                  count: wrapped.mostProductiveDay.achievementsCount,
                })}
                delay={650}
              />
            </View>
          )}

          {/* Plataforma más activa */}
          {wrapped.mostActivePlatform && (
            <View className="mt-3">
              <StatCard
                label={t('wrapped.most_active_platform')}
                value={PLATFORM_LABELS[wrapped.mostActivePlatform] ?? wrapped.mostActivePlatform}
                delay={700}
              />
            </View>
          )}

          {/* Botón compartir */}
          <Animated.View entering={FadeInDown.delay(750).duration(400)} className="mt-6">
            <Pressable
              className="w-full bg-primary rounded-xl py-4 items-center active:opacity-80"
              onPress={handleShare}
              accessibilityRole="button"
              accessibilityLabel={t('wrapped.share_cta')}
              style={{ minHeight: 52 }}
            >
              <Text className="text-white font-semibold text-base">{t('wrapped.share_cta')}</Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
