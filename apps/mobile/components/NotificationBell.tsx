import { Pressable, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { api } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';
import { FEATURES } from '../lib/featureFlags';

interface UnreadCountResponse {
  count: number;
}

export function NotificationBell() {
  const { t } = useTranslation();
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);

  const { data } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get<UnreadCountResponse>('/api/v1/notifications/me/unread-count'),
    enabled: isAuthenticated && FEATURES.notifications,
    staleTime: 1000 * 60,
    refetchInterval: 1000 * 60 * 2,
  });

  if (!FEATURES.notifications || !isAuthenticated) return null;

  const count = data?.count ?? 0;

  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      accessibilityRole="button"
      accessibilityLabel={
        count > 0
          ? t('notifications.bell_label_unread', { count })
          : t('notifications.bell_label')
      }
      accessibilityHint={t('notifications.bell_hint')}
      style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
    >
      <View style={{ position: 'relative' }}>
        <Ionicons name="notifications-outline" size={24} color="#d1d5db" />
        {count > 0 && (
          <View
            style={{
              position: 'absolute',
              top: -4,
              right: -6,
              backgroundColor: '#4f46e5',
              borderRadius: 8,
              minWidth: 16,
              height: 16,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: 3,
            }}
            accessibilityElementsHidden
          >
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>
              {count > 99 ? '99+' : count}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
