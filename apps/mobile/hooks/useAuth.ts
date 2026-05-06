// Hook de autenticación: encapsula login, register y logout
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { api, ApiRequestError } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';
import type { User } from '@unlockhub/types';

interface LoginInput {
  email: string;
  password: string;
}

interface RegisterInput {
  username: string;
  email: string;
  password: string;
}

interface AuthResponse {
  user: User;
}

// Convierte errores de la API a mensajes legibles para el usuario
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
  if (error instanceof Error && error.message.includes('fetch')) {
    return 'Sin conexión a internet. Comprueba tu red e inténtalo de nuevo.';
  }
  return 'Ocurrió un error inesperado. Por favor, inténtalo de nuevo.';
}

export function useAuth() {
  const { setUser, clearSession } = useSessionStore();
  const queryClient = useQueryClient();

  // Mutación de login
  const loginMutation = useMutation({
    mutationFn: (credentials: LoginInput) =>
      api.post<AuthResponse>('/api/v1/auth/login', credentials),
    onSuccess: (data) => {
      setUser(data.user);
      // Limpiar caché de otro usuario anterior antes de navegar
      queryClient.removeQueries();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    },
  });

  // Mutación de registro
  const registerMutation = useMutation({
    mutationFn: (input: RegisterInput) =>
      api.post<AuthResponse>('/api/v1/auth/register', input),
    onSuccess: (data) => {
      setUser(data.user);
      queryClient.removeQueries();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    },
  });

  // Mutación de logout
  const logoutMutation = useMutation({
    mutationFn: () => api.post<void>('/api/v1/auth/logout'),
    onSuccess: () => {
      clearSession();
      // Limpiamos todas las queries cacheadas al cerrar sesión
      void queryClient.clear();
      router.replace('/(auth)/login');
    },
    onError: () => {
      // Aunque falle la llamada al servidor, limpiamos la sesión local
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
