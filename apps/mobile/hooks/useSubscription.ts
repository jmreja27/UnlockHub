// Hook para gestionar la suscripción premium del usuario
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';

// Estructura del estado de suscripción devuelto por la API
interface SubscriptionStatus {
  isPremium: boolean;
  plan: string | null;
  expiresAt: string | null;
  provider: string | null;
}

// Datos necesarios para verificar y activar una suscripción
interface VerifySubscriptionInput {
  plan: 'MONTHLY' | 'ANNUAL';
  provider: 'GOOGLE_PLAY' | 'APP_STORE';
  storeTransactionId: string;
  expiresAt: string; // ISO 8601
}

// Clave de caché para TanStack Query
const SUBSCRIPTION_KEY = ['subscription', 'status'] as const;

// Obtiene el estado de suscripción, verifica una compra y cancela la suscripción activa
export function useSubscription() {
  const { isAuthenticated } = useSessionStore();
  const queryClient = useQueryClient();

  // Query del estado de suscripción actual
  const statusQuery = useQuery({
    queryKey: SUBSCRIPTION_KEY,
    queryFn: () => api.get<SubscriptionStatus>('/api/v1/subscriptions/status'),
    enabled: isAuthenticated,
    // El estado de suscripción puede cambiar pero no muy frecuentemente
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });

  // Mutación para verificar y activar una suscripción tras una compra en la tienda
  const verifyMutation = useMutation({
    mutationFn: (input: VerifySubscriptionInput) =>
      api.post<{ message: string }>('/api/v1/subscriptions/verify', input),
    onSuccess: () => {
      // Invalidar el cache de estado de suscripción para reflejar el nuevo estado
      void queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEY });
    },
  });

  // Mutación para cancelar la suscripción activa
  const cancelMutation = useMutation({
    mutationFn: () => api.delete<{ message: string }>('/api/v1/subscriptions'),
    onSuccess: () => {
      // Invalidar el cache de estado de suscripción tras cancelar
      void queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEY });
    },
  });

  return {
    // Estado de la suscripción
    subscriptionStatus: statusQuery.data,
    isLoadingStatus: statusQuery.isLoading,
    statusError: statusQuery.isError ? statusQuery.error : null,

    // Verificar y activar suscripción
    verifySubscription: verifyMutation.mutate,
    verifySubscriptionAsync: verifyMutation.mutateAsync,
    isVerifying: verifyMutation.isPending,
    verifyError: verifyMutation.isError ? verifyMutation.error : null,

    // Cancelar suscripción
    cancelSubscription: cancelMutation.mutate,
    cancelSubscriptionAsync: cancelMutation.mutateAsync,
    isCancelling: cancelMutation.isPending,
    cancelError: cancelMutation.isError ? cancelMutation.error : null,
  };
}
