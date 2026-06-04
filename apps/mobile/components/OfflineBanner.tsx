import { useEffect, useRef } from 'react';
import { Animated, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useNetworkStatus } from '../hooks/useNetworkStatus';

export function OfflineBanner() {
  const { t } = useTranslation();
  const { isOffline } = useNetworkStatus();
  const translateY = useRef(new Animated.Value(-60)).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: isOffline ? 0 : -60,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
  }, [isOffline, translateY]);

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          backgroundColor: '#374151',
          paddingVertical: 10,
          paddingHorizontal: 16,
          alignItems: 'center',
          transform: [{ translateY }],
        },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      accessibilityLabel={isOffline ? t('common.offline') : undefined}
      pointerEvents={isOffline ? 'auto' : 'none'}
    >
      <Text style={{ color: '#d1d5db', fontSize: 13, fontWeight: '600' }}>
        {t('common.offline')}
      </Text>
      <Text style={{ color: '#9ca3af', fontSize: 11, marginTop: 2 }}>
        {t('common.offline_hint')}
      </Text>
    </Animated.View>
  );
}
