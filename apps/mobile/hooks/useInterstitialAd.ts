import { useEffect, useRef, useCallback } from 'react';

import { useSessionStore } from '../stores/sessionStore';
import { ADMOB_TEST_IDS } from '../lib/adUnits';

const AD_UNIT_ID =
  process.env['EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID'] ?? ADMOB_TEST_IDS.INTERSTITIAL;

// Tipos mínimos del módulo
type InterstitialAdInstance = {
  load: () => void;
  show: () => void;
  addAdEventListener: (event: string, handler: () => void) => () => void;
};

type AdmobModule = {
  InterstitialAd: {
    createForAdRequest: (unitId: string) => InterstitialAdInstance;
  };
  AdEventType: { LOADED: string; CLOSED: string };
};

let admobModule: AdmobModule | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  admobModule = require('react-native-google-mobile-ads') as AdmobModule;
} catch {
  // Módulo no disponible
}

export function useInterstitialAd() {
  const isPremium = useSessionStore((s) => s.user?.isPremium ?? false);
  const adRef = useRef<InterstitialAdInstance | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (isPremium || !admobModule) return;

    const ad = admobModule.InterstitialAd.createForAdRequest(AD_UNIT_ID);
    adRef.current = ad;

    const unsubLoaded = ad.addAdEventListener(admobModule.AdEventType.LOADED, () => {
      loadedRef.current = true;
    });
    const unsubClosed = ad.addAdEventListener(admobModule.AdEventType.CLOSED, () => {
      loadedRef.current = false;
      // Pre-cargar el siguiente
      ad.load();
    });

    ad.load();

    return () => {
      unsubLoaded();
      unsubClosed();
    };
  }, [isPremium]);

  const show = useCallback((): boolean => {
    if (!loadedRef.current || !adRef.current || isPremium) return false;
    adRef.current.show();
    return true;
  }, [isPremium]);

  return { show };
}
