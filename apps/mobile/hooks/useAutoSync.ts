import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

import { api } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';

export function useAutoSync() {
  const { isAuthenticated, user } = useSessionStore();
  const firedRef = useRef(false);

  const fireSync = async () => {
    if (!isAuthenticated || !user) return;
    try {
      await api.post('/api/v1/sync/app-open');
    } catch {
      // Silencioso — el sync automático no debe interrumpir la UX
    }
  };

  // Disparo inicial al montar (cold start)
  useEffect(() => {
    if (!isAuthenticated || firedRef.current) return;
    firedRef.current = true;
    void fireSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Disparo al volver a primer plano (AppState active)
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active' && isAuthenticated) {
        void fireSync();
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user]);
}
