import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { PaginatedResponse, Friendship } from '@unlockhub/types';

import { api } from '../../lib/api';
import { useSessionStore } from '../../stores/sessionStore';
import { NotificationBell } from '../../components/NotificationBell';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface TabConfig {
  name: string;
  titleKey: string;
  icon: IoniconsName;
  iconFocused: IoniconsName;
}

const TABS: TabConfig[] = [
  { name: 'index', titleKey: 'tabs.home', icon: 'game-controller-outline', iconFocused: 'game-controller' },
  { name: 'search', titleKey: 'tabs.search', icon: 'search-outline', iconFocused: 'search' },
  { name: 'rankings', titleKey: 'tabs.rankings', icon: 'trophy-outline', iconFocused: 'trophy' },
  { name: 'friends', titleKey: 'tabs.friends', icon: 'people-outline', iconFocused: 'people' },
  { name: 'profile', titleKey: 'tabs.profile', icon: 'person-outline', iconFocused: 'person' },
];

export default function TabsLayout() {
  const { t } = useTranslation();
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);

  // Reutiliza la misma queryKey que useFriends para no crear peticiones duplicadas
  const { data: pendingData } = useQuery({
    queryKey: ['friends', 'pending'],
    queryFn: () => api.get<PaginatedResponse<Friendship>>('/api/v1/friends/pending?limit=1'),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 2,
  });
  const pendingCount = pendingData?.total ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerRight: () => <NotificationBell />,
        headerStyle: { backgroundColor: '#16213e' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: 'bold' },
        tabBarStyle: {
          backgroundColor: '#16213e',
          borderTopColor: '#0f3460',
        },
        tabBarActiveTintColor: '#818cf8',
        tabBarInactiveTintColor: '#6b7280',
      }}
    >
      {TABS.map((tab) => {
        const label = t(tab.titleKey);
        const badge = tab.name === 'friends' && pendingCount > 0 ? pendingCount : undefined;
        return (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: label,
              tabBarAccessibilityLabel: badge
                ? `${label} — ${badge} solicitudes pendientes`
                : label,
              tabBarBadge: badge,
              tabBarIcon: ({ focused, color, size }) => (
                <Ionicons
                  name={focused ? tab.iconFocused : tab.icon}
                  size={size}
                  color={color}
                  accessibilityElementsHidden
                />
              ),
            }}
          />
        );
      })}
    </Tabs>
  );
}
