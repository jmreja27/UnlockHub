import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

interface NewGamesBannerProps {
  count: number;
  onPress: () => void;
}

export function NewGamesBanner({ count, onPress }: NewGamesBannerProps) {
  const { t } = useTranslation();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(opacity, {
        toValue: 1,
        useNativeDriver: true,
        tension: 80,
        friction: 8,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 8,
      }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 8,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 10,
        opacity,
        transform: [{ translateY }],
      }}
      accessibilityLiveRegion="polite"
    >
      <Pressable
        testID="new-games-banner"
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('library.new_games_banner_a11y', { count })}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: pressed ? '#4338ca' : '#4f46e5',
          borderRadius: 999,
          paddingHorizontal: 14,
          paddingVertical: 7,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.35,
          shadowRadius: 4,
          elevation: 5,
        })}
      >
        <Ionicons name="arrow-up" size={14} color="white" />
        <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>
          {t('library.new_games_banner', { count })}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
