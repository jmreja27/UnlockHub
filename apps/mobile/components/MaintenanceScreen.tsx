import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

const RETRY_COUNTDOWN_S = 30;

interface Props {
  onRetry: () => Promise<void>;
}

export function MaintenanceScreen({ onRetry }: Props) {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState(RETRY_COUNTDOWN_S);
  const [isRetrying, setIsRetrying] = useState(false);

  // Cuenta atrás visual hasta el próximo reintento automático
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) return RETRY_COUNTDOWN_S;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleRetry() {
    setIsRetrying(true);
    setCountdown(RETRY_COUNTDOWN_S);
    await onRetry();
    setIsRetrying(false);
  }

  return (
    <SafeAreaView
      className="flex-1 bg-surface items-center justify-center px-8"
      accessibilityLiveRegion="polite"
    >
      {/* Icono */}
      <Text style={{ fontSize: 64, marginBottom: 24 }} accessibilityElementsHidden>
        🔧
      </Text>

      {/* Título */}
      <Text
        className="text-white text-2xl font-bold text-center mb-3"
        accessibilityRole="header"
      >
        {t('maintenance.title')}
      </Text>

      {/* Mensaje */}
      <Text className="text-gray-400 text-base text-center mb-8 leading-6">
        {t('maintenance.message')}
      </Text>

      {/* Cuenta atrás */}
      <View className="flex-row items-center mb-8" accessible accessibilityLabel={t('maintenance.retry_in', { seconds: countdown })}>
        <ActivityIndicator size="small" color="#818cf8" style={{ marginRight: 8 }} />
        <Text className="text-gray-500 text-sm">
          {t('maintenance.retry_in', { seconds: countdown })}
        </Text>
      </View>

      {/* Botón de reintento manual */}
      <Pressable
        className="w-full bg-primary rounded-xl py-4 items-center active:opacity-80"
        onPress={() => { void handleRetry(); }}
        disabled={isRetrying}
        accessibilityRole="button"
        accessibilityLabel={t('maintenance.retry_now')}
        accessibilityState={{ disabled: isRetrying, busy: isRetrying }}
        style={{ minHeight: 52 }}
      >
        {isRetrying ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text className="text-white font-semibold text-base">
            {t('maintenance.retry_now')}
          </Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}
