import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import '../global.css';
import '../i18n';
import { api } from '../lib/api';
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

// Comprueba en el arranque si la cookie de sesión sigue siendo válida
function SessionRestorer({ onReady }: { onReady: () => void }) {
  const { setUser } = useSessionStore();

  useEffect(() => {
    api
      .get<User>('/api/v1/users/me')
      .then((user) => setUser(user))
      .catch(() => { /* sin sesión activa, el store queda vacío */ })
      .finally(onReady);
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
