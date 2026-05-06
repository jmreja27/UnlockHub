// Componente de banner publicitario para usuarios free.
// Muestra un anuncio de AdMob si la librería está disponible,
// o un placeholder visual con las dimensiones de un banner estándar (320x50).
import { View, Text } from 'react-native';

import { useSessionStore } from '../stores/sessionStore';

// Dimensiones estándar de un banner de AdMob
const BANNER_WIDTH = 320;
const BANNER_HEIGHT = 50;

// Placeholder visual cuando la librería de AdMob no está disponible
function AdPlaceholder() {
  return (
    <View
      style={{ width: BANNER_WIDTH, height: BANNER_HEIGHT }}
      className="bg-surface-elevated border border-gray-700 rounded items-center justify-center self-center my-2"
      accessible
      accessibilityLabel="Espacio publicitario"
      accessibilityRole="none"
      importantForAccessibility="no-hide-descendants"
    >
      <Text className="text-gray-500 text-xs">Espacio publicitario</Text>
    </View>
  );
}

// Intenta importar BannerAd de react-native-google-mobile-ads de forma dinámica.
// Si no está instalada, renderiza el placeholder.
let AdMobBanner: React.ComponentType<{
  unitId: string;
  size: string;
  requestOptions?: Record<string, unknown>;
}> | null = null;

let BannerAdSize: { BANNER: string } | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const admob = require('react-native-google-mobile-ads') as {
    BannerAd: NonNullable<typeof AdMobBanner>;
    BannerAdSize: NonNullable<typeof BannerAdSize>;
  };
  AdMobBanner = admob.BannerAd;
  BannerAdSize = admob.BannerAdSize;
} catch {
  // react-native-google-mobile-ads no está instalado; se usará el placeholder
}

// ID de unidad de anuncio: en producción usar la variable de entorno correspondiente
const AD_UNIT_ID =
  process.env['EXPO_PUBLIC_ADMOB_BANNER_ID'] ?? 'ca-app-pub-3940256099942544/6300978111'; // ID de prueba de Google

// Renderiza null para usuarios premium, banner de AdMob o placeholder para usuarios free
export function AdBanner() {
  const { user } = useSessionStore();

  // Los usuarios premium nunca ven anuncios
  if (user?.isPremium) {
    return null;
  }

  // Si AdMob está disponible, mostrar el banner real
  if (AdMobBanner !== null && BannerAdSize !== null) {
    const BannerComponent = AdMobBanner;
    const adSize = BannerAdSize.BANNER;

    return (
      <View
        className="items-center my-2"
        accessible
        accessibilityLabel="Anuncio"
        accessibilityRole="none"
      >
        <BannerComponent unitId={AD_UNIT_ID} size={adSize} />
      </View>
    );
  }

  // Fallback al placeholder si AdMob no está disponible
  return <AdPlaceholder />;
}
