import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import '../global.css';
import '../i18n';
import { api, getRefreshToken, saveRefreshToken, deleteRefreshToken } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';
import { usePushNotifications } from '../hooks/usePushNotifications';
import type { User } from '@unlockhub/types';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: 2,
    },
  },
});

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

// Intenta restaurar la sesión usando el refresh token almacenado en SecureStore
function SessionRestorer({ onReady }: { onReady: () => void }) {
  const { setSession, clearSession } = useSessionStore();

  useEffect(() => {
    async function restore() {
      try {
        const storedRefresh = await getRefreshToken();
        if (!storedRefresh) return;

        // Usamos el refresh token para obtener un nuevo access token
        const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000';
        const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: storedRefresh }),
        });

        if (!res.ok) {
          await deleteRefreshToken();
          return;
        }

        const { accessToken, refreshToken } = (await res.json()) as RefreshResponse;
        await saveRefreshToken(refreshToken);

        // Con el access token fresco, obtenemos los datos del usuario
        const user = await api.get<User>('/api/v1/users/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        setSession(user, accessToken);
      } catch {
        clearSession();
      }
    }

    void restore().finally(onReady);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function PushNotificationsInit() {
  usePushNotifications();
  return null;
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  function handleReady() {
    setReady(true);
    void SplashScreen.hideAsync();
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SessionRestorer onReady={handleReady} />
      <PushNotificationsInit />
      <StatusBar style="light" />
      {ready && <Stack screenOptions={{ headerShown: false }} />}
    </QueryClientProvider>
  );
}
