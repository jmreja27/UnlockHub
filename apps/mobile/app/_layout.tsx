import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import { useColorScheme } from 'nativewind';
import type { User } from '@unlockhub/types';

import '../global.css';
import '../i18n';

import { api, getRefreshToken, saveRefreshToken, deleteRefreshToken } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';
import { usePreferencesStore } from '../stores/preferencesStore';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useGdprConsent } from '../hooks/useGdprConsent';
import { useRevenueCat } from '../hooks/useRevenueCat';
import { useMaintenanceCheck } from '../hooks/useMaintenanceCheck';
import { MaintenanceScreen } from '../components/MaintenanceScreen';
import { OfflineBanner } from '../components/OfflineBanner';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Inicializa Sentry — no-op si EXPO_PUBLIC_SENTRY_DSN no está definido
Sentry.init({
  dsn: process.env['EXPO_PUBLIC_SENTRY_DSN'],
  environment: __DEV__ ? 'development' : 'production',
  enabled: !__DEV__ && !!process.env['EXPO_PUBLIC_SENTRY_DSN'],
  tracesSampleRate: 0.1,
  beforeSend(event) {
    // Eliminar Authorization header para no enviar access tokens a Sentry
    if (event.request?.headers) {
      const headers = { ...event.request.headers } as Record<string, string>;
      delete headers['Authorization'];
      delete headers['authorization'];
      event.request.headers = headers;
    }
    // Eliminar body de requests de autenticación (login, register, reset-password)
    if (event.request?.data && typeof event.request.data === 'string') {
      const authPaths = ['/auth/login', '/auth/register', '/auth/reset-password', '/auth/refresh'];
      const url = event.request?.url ?? '';
      if (authPaths.some((p) => url.includes(p))) {
        event.request.data = '[redacted]';
      }
    }
    return event;
  },
});

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

// Solicita el consentimiento GDPR/ATT al iniciar la app
function GdprConsentInit() {
  useGdprConsent();
  return null;
}

function RevenueCatInit() {
  useRevenueCat();
  return null;
}

function PreferencesInit() {
  const { loadPreferences, theme } = usePreferencesStore();
  const { setColorScheme } = useColorScheme();

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  useEffect(() => {
    setColorScheme(theme === 'light' ? 'light' : 'dark');
  }, [theme, setColorScheme]);

  return null;
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const { isMaintenance, isChecking, retry } = useMaintenanceCheck();

  function handleReady() {
    setReady(true);
    void SplashScreen.hideAsync();
  }

  // Mantener el splash screen mientras se comprueba el estado de la API
  if (isChecking) return null;

  // Pantalla de mantenimiento — tiene prioridad sobre todo lo demás
  if (isMaintenance) {
    void SplashScreen.hideAsync();
    return <MaintenanceScreen onRetry={retry} />;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <PreferencesInit />
        <SessionRestorer onReady={handleReady} />
        <PushNotificationsInit />
        <GdprConsentInit />
        <RevenueCatInit />
        <StatusBar style="light" />
        <OfflineBanner />
        {ready && <Stack screenOptions={{ headerShown: false }} />}
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
