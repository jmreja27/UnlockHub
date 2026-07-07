import { useEffect, useRef, useCallback, useState } from 'react';
import * as Sentry from '@sentry/react-native';

import { api } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';
import { ADMOB_TEST_IDS } from '../lib/adUnits';

const AD_UNIT_ID =
  process.env['EXPO_PUBLIC_ADMOB_REWARDED_ID'] ?? ADMOB_TEST_IDS.REWARDED;

// Backoff de reintento tras AdEventType.ERROR — 3 intentos máximo antes de 'unavailable'
const RETRY_DELAYS_MS = [5000, 15000, 30000];

type RewardedAdInstance = {
  load: () => void;
  show: () => void;
  addAdEventListener: (event: string, handler: (reward?: { amount: number }) => void) => () => void;
};

type AdmobModule = {
  RewardedAd: {
    createForAdRequest: (unitId: string) => RewardedAdInstance;
  };
  AdEventType: { LOADED: string; CLOSED: string; ERROR: string };
  RewardedAdEventType: { LOADED: string; EARNED_REWARD: string };
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

export type RewardedAdState = 'loading' | 'ready' | 'unavailable';

export function useRewardedAd() {
  const isPremium = useSessionStore((s) => s.user?.isPremium ?? false);
  const adRef = useRef<RewardedAdInstance | null>(null);
  const [adState, setAdState] = useState<RewardedAdState>('loading');
  // Ref paralelo para uso dentro de callbacks sin stale closure
  const isReadyRef = useRef(false);
  // Limpia los listeners registrados por showForReward si el componente se desmonta en vuelo
  const showForRewardUnsubRef = useRef<(() => void) | null>(null);
  // Evita doble llamada simultánea a showForReward
  const inFlightRef = useRef(false);
  // Backoff de reintentos tras error de carga
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isPremium || !admobModule) return;

    const ad = admobModule.RewardedAd.createForAdRequest(AD_UNIT_ID);
    adRef.current = ad;

    const clearRetryTimeout = () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };

    const unsubLoaded = ad.addAdEventListener(admobModule.RewardedAdEventType.LOADED, () => {
      clearRetryTimeout();
      retryCountRef.current = 0;
      isReadyRef.current = true;
      setAdState('ready');
    });
    const unsubClosed = ad.addAdEventListener(admobModule.AdEventType.CLOSED, () => {
      isReadyRef.current = false;
      retryCountRef.current = 0;
      setAdState('loading');
      ad.load();
    });
    const unsubError = ad.addAdEventListener(admobModule.AdEventType.ERROR, () => {
      isReadyRef.current = false;
      if (retryCountRef.current >= RETRY_DELAYS_MS.length) {
        setAdState('unavailable');
        return;
      }
      setAdState('loading');
      const delay = RETRY_DELAYS_MS[retryCountRef.current];
      retryCountRef.current += 1;
      retryTimeoutRef.current = setTimeout(() => {
        retryTimeoutRef.current = null;
        ad.load();
      }, delay);
    });

    ad.load();

    return () => {
      unsubLoaded();
      unsubClosed();
      unsubError();
      clearRetryTimeout();
      // Limpiar los listeners de showForReward si estaban registrados al desmontarse
      showForRewardUnsubRef.current?.();
      showForRewardUnsubRef.current = null;
    };
  }, [isPremium]);

  // Reintento manual desde 'unavailable' — resetea el backoff y vuelve a intentar cargar.
  const retryLoad = useCallback(() => {
    if (!adRef.current) return;
    retryCountRef.current = 0;
    setAdState('loading');
    adRef.current.load();
  }, []);

  // Muestra el anuncio y, si el usuario lo completa (EARNED_REWARD), otorga 10 puntos via backend.
  // Si el usuario cierra el anuncio sin completarlo, no se otorgan puntos.
  // Retorna los puntos ganados o null si no aplica (premium, ad no cargado, cooldown, en vuelo, anuncio saltado).
  const showForReward = useCallback(async (): Promise<number | null> => {
    if (!isReadyRef.current || !adRef.current || !admobModule || isPremium || inFlightRef.current) {
      return null;
    }

    inFlightRef.current = true;

    return new Promise<number | null>((resolve) => {
      const ad = adRef.current!;
      let earnedReward = false;

      const unsubEarned = ad.addAdEventListener(admobModule!.RewardedAdEventType.EARNED_REWARD, () => {
        earnedReward = true;
      });

      const unsubClosed = ad.addAdEventListener(admobModule!.AdEventType.CLOSED, () => {
        showForRewardUnsubRef.current = null;
        inFlightRef.current = false;
        unsubEarned();
        unsubClosed();

        if (!earnedReward) {
          // El usuario cerró/saltó el anuncio sin completarlo — sin recompensa.
          resolve(null);
          return;
        }

        api
          .post<RewardResult>('/api/v1/users/me/points/rewarded-ad')
          .then((data) => resolve(data.pointsEarned))
          .catch((err: unknown) => {
            Sentry.captureException(err, { tags: { feature: 'rewarded_ad' } });
            resolve(null);
          });
      });

      showForRewardUnsubRef.current = () => {
        unsubEarned();
        unsubClosed();
      };
      ad.show();
    });
  }, [isPremium]);

  return { showForReward, isReady: adState === 'ready', adState, retryLoad };
}
