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
  const { user } = useSessionStore();
  const { show } = useInterstitialAd();
  const checkedRef = useRef(false);

  useEffect(() => {
    // Solo ejecutar cuando la lista está disponible y es la primera vez en esta sesión
    if (user?.isPremium || games.length === 0 || checkedRef.current) return;

    const completedNow = games.filter((g) => g.completionPct === 100).map((g) => g.id);
    if (completedNow.length === 0) return;

    checkedRef.current = true;

    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const knownIds: string[] = raw !== null ? (JSON.parse(raw) as string[]) : [];
        const knownSet = new Set(knownIds);

        const newlyCompleted = completedNow.filter((id) => !knownSet.has(id));
        if (newlyCompleted.length === 0) return;

        // Guardar todos los IDs completados (nuevos + previos), limitando el tamaño
        const updated = [...knownIds, ...newlyCompleted].slice(-MAX_IDS);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

        // Mostrar interstitial por el primer juego recién completado
        show();
      } catch {
        // AsyncStorage no disponible — continuar sin mostrar el ad
      }
    })();
  }, [games, show, user?.isPremium]);
}
