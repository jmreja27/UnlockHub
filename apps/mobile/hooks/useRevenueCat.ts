import { useEffect } from 'react';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

import { useSessionStore } from '../stores/sessionStore';

const RC_API_KEY = process.env['EXPO_PUBLIC_REVENUECAT_API_KEY'];

// Inicializa RevenueCat con el userId del usuario autenticado.
// Solo opera si EXPO_PUBLIC_REVENUECAT_API_KEY está definida.
export function initRevenueCat(userId: string): void {
  if (!RC_API_KEY) return;

  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey: RC_API_KEY });
  void Purchases.logIn(userId);
}

// Desvincula al usuario de RevenueCat en el logout.
export async function cleanupRevenueCat(): Promise<void> {
  if (!RC_API_KEY) return;
  try {
    await Purchases.logOut();
  } catch {
    // logOut falla si no hay usuario autenticado — ignorar
  }
}

// Hook que inicializa RevenueCat automáticamente cuando el usuario se autentica.
export function useRevenueCat(): void {
  const { user, isAuthenticated } = useSessionStore();

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      initRevenueCat(user.id);
    }
  }, [isAuthenticated, user?.id]);
}
