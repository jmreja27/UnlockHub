import { useEffect, useRef, useCallback } from 'react';

import { api } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';
import { ADMOB_TEST_IDS } from '../lib/adUnits';

const AD_UNIT_ID =
  process.env['EXPO_PUBLIC_ADMOB_REWARDED_ID'] ?? ADMOB_TEST_IDS.REWARDED;

type RewardedAdInstance = {
  load: () => void;
  show: () => void;
  addAdEventListener: (event: string, handler: (reward?: { amount: number }) => void) => () => void;
};

type AdmobModule = {
  RewardedAd: {
    createForAdRequest: (unitId: string) => RewardedAdInstance;
  };
  AdEventType: { LOADED: string; CLOSED: string };
  RewardedAdEventType: { LOADED: string };
};

let admobModule: AdmobModule | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  admobModule = require('react-native-google-mobile-ads') as AdmobModule;
} catch {
  // Módulo no disponible
}

interface RewardResult {
  pointsEarned: number;
}

export function useRewardedAd() {
  const { user } = useSessionStore();
  const adRef = useRef<RewardedAdInstance | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (user?.isPremium || !admobModule) return;

    const ad = admobModule.RewardedAd.createForAdRequest(AD_UNIT_ID);
    adRef.current = ad;

    const unsubLoaded = ad.addAdEventListener(admobModule.RewardedAdEventType.LOADED, () => {
      loadedRef.current = true;
    });
    const unsubClosed = ad.addAdEventListener(admobModule.AdEventType.CLOSED, () => {
      loadedRef.current = false;
      ad.load();
    });

    ad.load();

    return () => {
      unsubLoaded();
      unsubClosed();
    };
  }, [user?.isPremium]);

  // Muestra el anuncio y, si el usuario lo completa, otorga 10 puntos via backend.
  // Retorna los puntos ganados o null si no aplica (premium, ad no cargado, cooldown).
  const showForReward = useCallback(async (): Promise<number | null> => {
    if (!loadedRef.current || !adRef.current || !admobModule || user?.isPremium) {
      return null;
    }

    return new Promise<number | null>((resolve) => {
      const ad = adRef.current!;

      const unsubClosed = ad.addAdEventListener(admobModule!.AdEventType.CLOSED, () => {
        unsubClosed();

        // Otorgar puntos al cerrar, independientemente de si EARNED_REWARD se disparó
        api
          .post<RewardResult>('/api/v1/points/rewarded-ad')
          .then((data) => resolve(data.pointsEarned))
          .catch(() => resolve(null));
      });

      ad.show();
    });
  }, [user?.isPremium]);

  return { showForReward, isReady: loadedRef.current };
}
