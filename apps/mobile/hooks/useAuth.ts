import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import type { User } from '@unlockhub/types';

import { api, ApiRequestError, saveRefreshToken, getRefreshToken, deleteRefreshToken } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';

interface LoginInput {
  email: string;
  password: string;
}

interface RegisterInput {
  username: string;
  email: string;
  password: string;
  birthDate: string;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

/**
 * Convierte un error de autenticación en un mensaje legible para el usuario.
 * Clasifica errores de red, HTTP y errores de la API.
 */
function humanizeAuthError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const { statusCode, apiError } = error;
    if (statusCode === 401) return 'Email o contraseña incorrectos. Por favor, comprueba tus datos.';
    if (statusCode === 409) return 'Ya existe una cuenta con ese email o nombre de usuario.';
    if (statusCode === 422) return 'Los datos introducidos no son válidos. Revisa el formulario.';
    if (statusCode === 429) return 'Demasiados intentos. Espera unos minutos antes de intentarlo de nuevo.';
    if (statusCode >= 500) return 'El servidor no está disponible. Por favor, inténtalo más tarde.';
    return apiError.error || 'Ocurrió un error inesperado.';
  }
  if (error instanceof TypeError || (error instanceof Error && (
    error.message.includes('fetch') ||
    error.message.includes('Network request failed') ||
    error.message.includes('Network Error')
  ))) {
    return 'Sin conexión a internet. Comprueba tu red e inténtalo de nuevo.';
  }
  return 'Ocurrió un error inesperado. Por favor, inténtalo de nuevo.';
}

/**
 * Hook central de autenticación: login, registro y logout.
 * En logout, elimina el refresh token de SecureStore, limpia la sesión en Zustand y
 * vacía el caché de TanStack Query antes de navegar a login.
 */
export function useAuth() {
  const { setSession, clearSession } = useSessionStore();
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: (credentials: LoginInput) =>
      api.post<AuthResponse>('/api/v1/auth/login', credentials, { skipRefresh: true }),
    onSuccess: async (data) => {
      await saveRefreshToken(data.refreshToken);
      setSession(data.user, data.accessToken);
      queryClient.removeQueries();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    },
  });

  const registerMutation = useMutation({
    mutationFn: (input: RegisterInput) =>
      api.post<AuthResponse>('/api/v1/auth/register', input, { skipRefresh: true }),
    onSuccess: async (data) => {
      await saveRefreshToken(data.refreshToken);
      setSession(data.user, data.accessToken);
      queryClient.removeQueries();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/onboarding');
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const refreshToken = await getRefreshToken();
      return api.post<void>('/api/v1/auth/logout', { refreshToken });
    },
    onSuccess: async () => {
      await deleteRefreshToken();
      clearSession();
      void queryClient.clear();
      router.replace('/(auth)/login');
    },
    onError: async () => {
      await deleteRefreshToken();
      clearSession();
      void queryClient.clear();
      router.replace('/(auth)/login');
    },
  });

  return {
    login: loginMutation.mutate,
    loginAsync: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.isError ? humanizeAuthError(loginMutation.error) : null,

    register: registerMutation.mutate,
    registerAsync: registerMutation.mutateAsync,
    isRegistering: registerMutation.isPending,
    registerError: registerMutation.isError ? humanizeAuthError(registerMutation.error) : null,

    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
