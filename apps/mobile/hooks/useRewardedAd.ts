import { useEffect, useRef, useCallback, useState } from 'react';

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
  const [isReady, setIsReady] = useState(false);
  // Ref paralelo para uso dentro de callbacks sin stale closure
  const isReadyRef = useRef(false);
  // Limpia el listener CLOSED registrado por showForReward si el componente se desmonta en vuelo
  const showForRewardUnsubRef = useRef<(() => void) | null>(null);
  // Evita doble llamada simultánea a showForReward
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (user?.isPremium || !admobModule) return;

    const ad = admobModule.RewardedAd.createForAdRequest(AD_UNIT_ID);
    adRef.current = ad;

    const unsubLoaded = ad.addAdEventListener(admobModule.RewardedAdEventType.LOADED, () => {
      isReadyRef.current = true;
      setIsReady(true);
    });
    const unsubClosed = ad.addAdEventListener(admobModule.AdEventType.CLOSED, () => {
      isReadyRef.current = false;
      setIsReady(false);
      ad.load();
    });

    ad.load();

    return () => {
      unsubLoaded();
      unsubClosed();
      // Limpiar el listener de showForReward si estaba registrado al desmontarse
      showForRewardUnsubRef.current?.();
      showForRewardUnsubRef.current = null;
    };
  }, [user?.isPremium]);

  // Muestra el anuncio y, si el usuario lo completa, otorga 10 puntos via backend.
  // Retorna los puntos ganados o null si no aplica (premium, ad no cargado, cooldown, en vuelo).
  const showForReward = useCallback(async (): Promise<number | null> => {
    console.log('[REWARDED] llamado, loaded:', isReadyRef.current, 'inFlight:', inFlightRef.current);
    if (!isReadyRef.current || !adRef.current || !admobModule || user?.isPremium || inFlightRef.current) {
      return null;
    }

    inFlightRef.current = true;

    return new Promise<number | null>((resolve) => {
      const ad = adRef.current!;

      const unsubClosed = ad.addAdEventListener(admobModule!.AdEventType.CLOSED, () => {
        console.log('[REWARDED] CLOSED disparado');
        showForRewardUnsubRef.current = null;
        inFlightRef.current = false;
        unsubClosed();

        // Otorgar puntos al cerrar, independientemente de si EARNED_REWARD se disparó
        console.log('[REWARDED] llamando backend');
        api
          .post<RewardResult>('/api/v1/users/me/points/rewarded-ad')
          .then((data) => resolve(data.pointsEarned))
          .catch((e) => {
            console.error('[REWARDED] error completo:', JSON.stringify({
              message: e.message,
              statusCode: e.statusCode,
              apiError: e.apiError,
              name: e.name
            }));
            resolve(null);
          });
      });

      console.log('[REWARDED] listener CLOSED registrado');
      showForRewardUnsubRef.current = unsubClosed;
      ad.show();
    });
  }, [user?.isPremium]);

  return { showForReward, isReady };
}
