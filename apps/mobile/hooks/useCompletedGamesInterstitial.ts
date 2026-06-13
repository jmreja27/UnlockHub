import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useSessionStore } from '../stores/sessionStore';

import { useInterstitialAd } from './useInterstitialAd';
import type { LibraryGame } from './useMyGames';

const STORAGE_KEY = 'admob:completed_game_ids';
// Máximo de IDs almacenados para no crecer indefinidamente
const MAX_IDS = 500;

/**
 * Detecta juegos recién completados al 100% y muestra un interstitial la primera vez.
 * Persiste los IDs ya completados en AsyncStorage para no repetir el ad en sesiones futuras.
 * Solo para usuarios free. Llamar desde LibraryScreen con la lista completa de juegos.
 */
export function useCompletedGamesInterstitial(games: LibraryGame[]) {
  const isPremium = useSessionStore((s) => s.user?.isPremium ?? false);
  const { show } = useInterstitialAd();
  const checkedRef = useRef(false);

  useEffect(() => {
    // Solo ejecutar cuando la lista está disponible y es la primera vez en esta sesión
    if (isPremium || games.length === 0 || checkedRef.current) return;

    const completedNow = games.filter((g) => g.completionPct === 100).map((g) => g.id);
    if (completedNow.length === 0) return;

    checkedRef.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;

        const knownIds: string[] = raw !== null ? (JSON.parse(raw) as string[]) : [];
        const knownSet = new Set(knownIds);

        const newlyCompleted = completedNow.filter((id) => !knownSet.has(id));
        if (newlyCompleted.length === 0) return;

        // Mostrar interstitial por el primer juego recién completado; guardar IDs solo si se mostró
        const shown = show();
        if (shown) {
          const updated = [...knownIds, ...newlyCompleted].slice(-MAX_IDS);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        }
      } catch {
        // AsyncStorage no disponible — continuar sin mostrar el ad
      }
    })();

    return () => { cancelled = true; };
  }, [games, show, isPremium]);
}
