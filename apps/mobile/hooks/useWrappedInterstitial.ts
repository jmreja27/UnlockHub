import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useSessionStore } from '../stores/sessionStore';

import { useInterstitialAd } from './useInterstitialAd';

const COOLDOWN_KEY = 'admob:wrapped_interstitial:last_shown';
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
// Breve retardo para que el ad tenga tiempo de cargarse y la pantalla se renderice
const SHOW_DELAY_MS = 1500;

/**
 * Muestra un interstitial al entrar en la pantalla de Wrapped, con cooldown de 24h.
 * Solo para usuarios free. Guardar timestamp en AsyncStorage para persistir entre sesiones.
 */
export function useWrappedInterstitial() {
  const { user } = useSessionStore();
  const { show } = useInterstitialAd();
  const shownRef = useRef(false);
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (user?.isPremium || shownRef.current) return;

    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(COOLDOWN_KEY);
        const lastShown = raw !== null ? parseInt(raw, 10) : 0;
        if (Date.now() - lastShown < COOLDOWN_MS) return;

        shownRef.current = true;
        timeoutIdRef.current = setTimeout(() => {
          const shown = show();
          if (shown) {
            void AsyncStorage.setItem(COOLDOWN_KEY, String(Date.now()));
          }
        }, SHOW_DELAY_MS);
      } catch {
        // AsyncStorage no disponible — continuar sin mostrar el ad
      }
    })();

    return () => {
      if (timeoutIdRef.current !== undefined) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = undefined;
      }
    };
  }, [show, user?.isPremium]);
}
