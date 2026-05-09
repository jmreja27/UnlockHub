import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface TabConfig {
  name: string;
  titleKey: string;
  icon: IoniconsName;
  iconFocused: IoniconsName;
}

// Configuración de tabs con claves de traducción
const TABS: TabConfig[] = [
  { name: 'index', titleKey: 'tabs.home', icon: 'home-outline', iconFocused: 'home' },
  { name: 'search', titleKey: 'tabs.search', icon: 'search-outline', iconFocused: 'search' },
  { name: 'rankings', titleKey: 'tabs.rankings', icon: 'trophy-outline', iconFocused: 'trophy' },
  { name: 'friends', titleKey: 'tabs.friends', icon: 'people-outline', iconFocused: 'people' },
  { name: 'profile', titleKey: 'tabs.profile', icon: 'person-outline', iconFocused: 'person' },
];

export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
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
        return (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: label,
              tabBarAccessibilityLabel: label,
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
