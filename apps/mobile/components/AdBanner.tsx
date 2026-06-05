import { View, Text } from 'react-native';

import { useSessionStore } from '../stores/sessionStore';
import { ADMOB_TEST_IDS } from '../lib/adUnits';

const BANNER_WIDTH = 320;
const BANNER_HEIGHT = 50;

type BannerPlacement = 'home' | 'search' | 'rankings' | 'friends';

const UNIT_IDS: Record<BannerPlacement, string> = {
  home: process.env['EXPO_PUBLIC_ADMOB_HOME_BANNER_ID'] ?? ADMOB_TEST_IDS.BANNER,
  search: process.env['EXPO_PUBLIC_ADMOB_SEARCH_BANNER_ID'] ?? ADMOB_TEST_IDS.BANNER,
  rankings: process.env['EXPO_PUBLIC_ADMOB_RANKINGS_BANNER_ID'] ?? ADMOB_TEST_IDS.BANNER,
  friends: process.env['EXPO_PUBLIC_ADMOB_FRIENDS_BANNER_ID'] ?? ADMOB_TEST_IDS.BANNER,
};

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

let AdMobBanner: React.ComponentType<{
  unitId: string;
  size: string;
  requestOptions?: Record<string, unknown>;
}> | null = null;

let BannerAdSize: { BANNER: string } | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const admob = require('react-native-google-mobile-ads') as {
    BannerAd: NonNullable<typeof AdMobBanner>;
    BannerAdSize: NonNullable<typeof BannerAdSize>;
  };
  AdMobBanner = admob.BannerAd;
  BannerAdSize = admob.BannerAdSize;
} catch {
  // react-native-google-mobile-ads no disponible; se usará el placeholder
}

interface AdBannerProps {
  unitId?: BannerPlacement;
}

export function AdBanner({ unitId = 'home' }: AdBannerProps) {
  const { user } = useSessionStore();

  if (user?.isPremium) return null;

  if (AdMobBanner !== null && BannerAdSize !== null) {
    const BannerComponent = AdMobBanner;
    const adSize = BannerAdSize.BANNER;
    const adUnitId = UNIT_IDS[unitId];

    return (
      <View
        className="items-center my-2"
        accessible
        accessibilityLabel="Anuncio"
        accessibilityRole="none"
      >
        <BannerComponent unitId={adUnitId} size={adSize} />
      </View>
    );
  }

  return <AdPlaceholder />;
}
