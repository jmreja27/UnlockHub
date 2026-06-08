import { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PaginatedResponse } from '@unlockhub/types';

import { api } from '../lib/api';
import { EmptyState } from '../components/EmptyState';
import { SkeletonBox } from '../components/SkeletonBox';
import { useTheme } from '../hooks/useTheme';
import { queryKeys } from '../lib/queryKeys';

interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

const TYPE_ICONS: Record<string, string> = {
  FRIEND_REQUEST: '👥',
  ACHIEVEMENT_CHALLENGE: '🎯',
  RANKING_UP: '🏆',
  CHALLENGE_COMPLETED: '✅',
  STREAK_RISK: '🔥',
};

function NotificationItem({
  item,
  onRead,
}: {
  item: AppNotification;
  onRead: (id: string) => void;
}) {
  const colors = useTheme();
  const icon = TYPE_ICONS[item.type] ?? '🔔';
  const timeAgo = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(
    Math.round((new Date(item.createdAt).getTime() - Date.now()) / 1000 / 60),
    'minutes',
  );

  return (
    <Pressable
      onPress={() => {
        if (!item.read) onRead(item.id);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.body}`}
      accessibilityState={{ checked: item.read }}
      style={{ minHeight: 64, borderBottomWidth: 1, borderBottomColor: colors.border, opacity: item.read ? 0.6 : 1 }}
      className="flex-row items-start px-4 py-3"
    >
      <Text style={{ fontSize: 24, marginRight: 12, marginTop: 2 }} accessibilityElementsHidden>
        {icon}
      </Text>
      <View className="flex-1">
        <View className="flex-row items-center justify-between mb-0.5">
          <Text
            className="text-sm font-semibold"
            style={{ color: item.read ? colors.textSecondary : colors.text }}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          {!item.read && (
            <View
              className="w-2 h-2 rounded-full bg-primary ml-2"
              accessibilityElementsHidden
            />
          )}
        </View>
        <Text className="text-xs" style={{ color: colors.textSecondary }} numberOfLines={2}>
          {item.body}
        </Text>
        <Text className="text-xs mt-1" style={{ color: colors.textMuted }}>{timeAgo}</Text>
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const colors = useTheme();
  const queryClient = useQueryClient();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: queryKeys.notifications(),
    queryFn: ({ pageParam = 1 }) =>
      api.get<PaginatedResponse<AppNotification>>(
        `/api/v1/notifications/me?page=${pageParam as number}&limit=20`,
      ),
    getNextPageParam: (last) =>
      last.page * last.limit < last.total ? last.page + 1 : undefined,
    initialPageParam: 1,
    staleTime: 1000 * 30,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/notifications/me/${id}/read`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationsUnreadCount() });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => api.patch('/api/v1/notifications/me/read-all', {}),
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationsUnreadCount() });
    },
  });

  const notifications = data?.pages.flatMap((p) => p.data) ?? [];
  const hasUnread = notifications.some((n) => !n.read);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="px-4 pt-4">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBox key={i} width="100%" height={64} borderRadius={8} style={{ marginBottom: 8 }} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
        >
          <Text className="text-primary-light text-base">{t('common.back')}</Text>
        </Pressable>
        <Text
          className="text-lg font-bold"
          style={{ color: colors.text }}
          accessibilityRole="header"
        >
          {t('notifications.title')}
        </Text>
        {hasUnread ? (
          <Pressable
            onPress={() => markAllMutation.mutate()}
            disabled={markAllMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel={t('notifications.mark_all_read')}
            style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' }}
          >
            <Text className="text-primary-light text-sm">{t('notifications.mark_all_read')}</Text>
          </Pressable>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      {notifications.length === 0 ? (
        <EmptyState
          emoji="🔔"
          title={t('notifications.empty_title')}
          body={t('notifications.empty_body')}
        />
      ) : (
        <FlashList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NotificationItem
              item={item}
              onRead={(id) => markReadMutation.mutate(id)}
            />
          )}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View className="py-4 items-center">
                <SkeletonBox width={200} height={16} borderRadius={4} />
              </View>
            ) : null
          }
          accessibilityLabel={t('notifications.list_label')}
        />
      )}
    </SafeAreaView>
  );
}
