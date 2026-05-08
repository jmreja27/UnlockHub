import { View, Text, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { useFeed } from '../../hooks/useFeed';
import { ActivityCard } from '../../components/ActivityCard';
import { SkeletonBox } from '../../components/SkeletonBox';
import { AdBanner } from '../../components/AdBanner';
import type { ActivityEvent } from '@unlockhub/types';

function FeedSkeleton() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} className="flex-row items-center px-4 py-3 border-b border-gray-800">
          <SkeletonBox width={44} height={44} borderRadius={22} />
          <View className="flex-1 ml-3">
            <SkeletonBox height={14} width="80%" style={{ marginBottom: 6 }} />
            <SkeletonBox height={10} width="40%" />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function FeedScreen() {
  const { t } = useTranslation();
  const { events, isLoading, isError, refetch } = useFeed();

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="px-4 py-3 border-b border-gray-800">
        <Text
          className="text-white text-xl font-bold"
          accessibilityRole="header"
        >
          {t('feed.title')}
        </Text>
      </View>

      {isLoading ? (
        <FeedSkeleton />
      ) : isError ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text
            className="text-white text-lg font-semibold text-center"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {t('feed.error_title')}
          </Text>
          <Text className="text-gray-400 mt-2 text-center">
            {t('feed.error_message')}
          </Text>
        </View>
      ) : (
        <FlashList
          data={events}
          keyExtractor={(item: ActivityEvent) => item.id}
          renderItem={({ item }: { item: ActivityEvent }) => <ActivityCard event={item} />}
          estimatedItemSize={72}
          accessibilityLabel={t('feed.loading_label')}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => void refetch()}
              accessibilityLabel={t('feed.refresh_label')}
              tintColor="#fff"
            />
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-6 mt-20">
              <Text
                className="text-gray-400 text-center text-base"
                accessibilityLiveRegion="polite"
              >
                {t('feed.empty')}
              </Text>
            </View>
          }
          ListFooterComponent={<AdBanner />}
        />
      )}
    </SafeAreaView>
  );
}
