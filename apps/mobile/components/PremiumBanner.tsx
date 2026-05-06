// Banner reutilizable que muestra el estado premium del usuario o invita a actualizar
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useSubscription } from '../hooks/useSubscription';
import { useSessionStore } from '../stores/sessionStore';

// Formatea una fecha ISO a formato legible en español
function formatExpiryDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Banner de promoción premium para usuarios free: invita a actualizar con beneficios clave
function FreeBanner() {
  function handlePress() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(tabs)/profile');
  }

  return (
    <Pressable
      className="mx-6 mb-4 bg-primary/20 border border-primary/40 rounded-2xl px-4 py-4 active:opacity-80"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="Actualiza a Premium"
      accessibilityHint="Abre la pantalla para suscribirte a Premium y eliminar anuncios"
      style={{ minHeight: 44 }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 mr-3">
          <Text
            className="text-primary-light font-bold text-sm mb-0.5"
            accessibilityRole="text"
          >
            Actualiza a Premium
          </Text>
          <Text className="text-gray-400 text-xs">
            Sin anuncios + sync cada 5 min
          </Text>
        </View>
        <View
          className="bg-primary/30 rounded-full px-3 py-1"
          accessibilityElementsHidden
        >
          <Text className="text-primary-light text-xs font-semibold">Ver más</Text>
        </View>
      </View>
    </Pressable>
  );
}

// Banner de confirmación premium para usuarios con suscripción activa
function PremiumActiveBanner({ expiresAt }: { expiresAt: string | null }) {
  return (
    <View
      className="mx-6 mb-4 bg-surface-elevated border border-primary/30 rounded-2xl px-4 py-4"
      accessible
      accessibilityLabel={
        expiresAt
          ? `Eres Premium. Tu suscripción vence el ${formatExpiryDate(expiresAt)}`
          : 'Eres Premium'
      }
      accessibilityRole="text"
    >
      <View className="flex-row items-center">
        <View className="flex-1">
          <Text className="text-primary-light font-bold text-sm mb-0.5">
            Eres Premium ✓
          </Text>
          {expiresAt && (
            <Text className="text-gray-400 text-xs">
              Vence el {formatExpiryDate(expiresAt)}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

// Componente principal: renderiza el banner adecuado según el estado de suscripción
export function PremiumBanner() {
  const { isAuthenticated } = useSessionStore();
  const { subscriptionStatus, isLoadingStatus } = useSubscription();

  // No renderizar si el usuario no está autenticado o la consulta está cargando
  if (!isAuthenticated || isLoadingStatus) {
    return null;
  }

  if (subscriptionStatus?.isPremium) {
    return <PremiumActiveBanner expiresAt={subscriptionStatus.expiresAt} />;
  }

  return <FreeBanner />;
}
