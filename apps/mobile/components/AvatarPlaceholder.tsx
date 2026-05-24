import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { StyleProp, ViewStyle } from 'react-native';

interface Props {
  username: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

// Genera un color de fondo determinista a partir del username — mismo username, mismo color siempre
function getAvatarColor(username: string): string {
  const colors = [
    '#6366f1', // indigo
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#f59e0b', // amber
    '#10b981', // emerald
    '#3b82f6', // blue
    '#ef4444', // red
    '#14b8a6', // teal
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length] ?? colors[0]!;
}

// Extrae hasta 2 iniciales del username
function getInitials(username: string): string {
  return username.slice(0, 2).toUpperCase();
}

export function AvatarPlaceholder({ username, size = 80, style }: Props) {
  const { t } = useTranslation();
  const backgroundColor = getAvatarColor(username);
  const initials = getInitials(username);
  const fontSize = Math.round(size * 0.35);
  const borderRadius = size / 2;

  return (
    <View
      testID="avatar-placeholder-container"
      style={[
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor,
          justifyContent: 'center',
          alignItems: 'center',
        },
        style,
      ]}
      accessible
      accessibilityLabel={t('profile.avatar_placeholder', { username })}
    >
      <Text
        style={{ color: '#fff', fontSize, fontWeight: '700', letterSpacing: 1 }}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {initials}
      </Text>
    </View>
  );
}

export { getAvatarColor, getInitials };
