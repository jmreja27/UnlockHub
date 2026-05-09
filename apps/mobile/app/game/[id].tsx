import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useGameDetail } from '../../hooks/useSearch';
import { SkeletonBox } from '../../components/SkeletonBox';

const PLATFORM_LABEL: Record<string, string> = {
  STEAM: 'Steam',
  RA: 'RetroAchievements',
  XBOX: 'Xbox',
  PSN: 'PlayStation',
};

export default function GameDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { data: game, isLoading, isError } = useGameDetail(id ?? null);

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1">
        {/* Header */}
        <View className="px-4 pt-4 pb-3">
          <Pressable
            onPress={() => router.back()}
            className="self-start mb-4"
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text className="text-primary-light text-base">{t('common.back')}</Text>
          </Pressable>

          {isLoading ? (
            <>
              <SkeletonBox className="h-7 w-48 rounded-lg mb-2" />
              <SkeletonBox className="h-4 w-24 rounded-lg" />
            </>
          ) : isError || !game ? (
            <Text className="text-red-400 text-base">{t('search.game_not_found')}</Text>
          ) : (
            <View className="flex-row items-center">
              <Image
                source={game.iconUrl ?? require('../../assets/images/icon.png')}
                style={{ width: 56, height: 56, borderRadius: 10 }}
                contentFit="cover"
                accessibilityElementsHidden
              />
              <View className="ml-3 flex-1">
                <Text
                  className="text-white text-xl font-bold"
                  accessibilityRole="header"
                  numberOfLines={2}
                >
                  {game.title}
                </Text>
                <Text className="text-gray-400 text-xs mt-0.5">
                  {PLATFORM_LABEL[game.platform] ?? game.platform} ·{' '}
                  {t('search.achievements_count', { count: game.totalAchievements })}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Lista de logros */}
        {isLoading ? (
          <View className="px-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <SkeletonBox key={i} className="h-20 rounded-xl mb-2" />
            ))}
          </View>
        ) : game && game.achievements.length > 0 ? (
          <FlashList
            data={game.achievements}
            keyExtractor={(a) => a.id}
            estimatedItemSize={84}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            renderItem={({ item: achievement }) => (
              <View className="flex-row items-center bg-surface-card rounded-xl px-3 py-3 mb-2">
                <Image
                  source={achievement.iconUrl ?? require('../../assets/images/icon.png')}
                  style={{ width: 44, height: 44, borderRadius: 8 }}
                  contentFit="cover"
                  accessibilityElementsHidden
                />
                <View className="flex-1 ml-3">
                  <Text className="text-white font-semibold text-sm" numberOfLines={1}>
                    {achievement.title}
                  </Text>
                  {achievement.description ? (
                    <Text className="text-gray-400 text-xs mt-0.5" numberOfLines={2}>
                      {achievement.description}
                    </Text>
                  ) : null}
                  <View className="flex-row items-center mt-1 gap-3">
                    <Text className="text-primary-light text-xs font-medium">
                      {achievement.normalizedPoints} XP
                    </Text>
                    {achievement.rarity != null && (
                      <Text className="text-gray-500 text-xs">
                        {t('game.rarity', { pct: achievement.rarity.toFixed(1) })}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            )}
          />
        ) : game && game.achievements.length === 0 ? (
          <Text className="text-gray-500 text-sm text-center mt-12">
            {t('game.no_achievements')}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
