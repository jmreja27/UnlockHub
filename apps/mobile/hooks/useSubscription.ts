import { useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  initConnection,
  endConnection,
  requestSubscription,
  requestPurchase,
  finishTransaction,
  purchaseErrorListener,
  purchaseUpdatedListener,
  type Purchase,
  type PurchaseError,
} from 'react-native-iap';

import { api } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';
import { PRODUCT_IDS, type PurchasablePlan } from '../lib/iap';

interface SubscriptionStatus {
  isPremium: boolean;
  plan: string | null;
  expiresAt: string | null;
  provider: string | null;
}

interface VerifyPayload {
  plan: 'MONTHLY' | 'ANNUAL' | 'LIFETIME';
  provider: 'GOOGLE_PLAY' | 'APP_STORE';
  storeTransactionId: string;
  expiresAt?: string;
}

const SUBSCRIPTION_KEY = ['subscription', 'status'] as const;
const PROVIDER = Platform.OS === 'ios' ? 'APP_STORE' : 'GOOGLE_PLAY';

// Calcula la fecha de expiración aproximada para suscripciones mensuales
function monthlyExpiresAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 32); // 31 días + 1 de margen
  return d.toISOString();
}

export function useSubscription() {
  const { isAuthenticated } = useSessionStore();
  const queryClient = useQueryClient();

  // Inicializar y limpiar la conexión IAP
  useEffect(() => {
    if (!isAuthenticated) return;
    void initConnection();
    return () => {
      void endConnection();
    };
  }, [isAuthenticated]);

  // Query del estado de suscripción actual
  const statusQuery = useQuery({
    queryKey: SUBSCRIPTION_KEY,
    queryFn: () => api.get<SubscriptionStatus>('/api/v1/subscriptions/status'),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });

  // Mutación para verificar y activar una suscripción en nuestro backend
  const verifyMutation = useMutation({
    mutationFn: (payload: VerifyPayload) =>
      api.post<{ message: string }>('/api/v1/subscriptions/verify', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEY });
    },
  });

  // Mutación para cancelar la suscripción mensual activa
  const cancelMutation = useMutation({
    mutationFn: () => api.delete<{ message: string }>('/api/v1/subscriptions'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEY });
    },
  });

  // Lanza el flujo de compra nativo y verifica con el backend al completarse
  const purchase = useCallback(
    async (plan: PurchasablePlan): Promise<void> => {
      const isLifetime = plan === 'LIFETIME';

      // Escuchar actualizaciones de compra antes de lanzar el flujo
      const updateSub = purchaseUpdatedListener(async (p: Purchase) => {
        try {
          const payload: VerifyPayload = {
            plan: isLifetime ? 'LIFETIME' : 'MONTHLY',
            provider: PROVIDER,
            storeTransactionId: p.transactionId ?? p.purchaseToken ?? '',
            expiresAt: isLifetime ? undefined : monthlyExpiresAt(),
          };
          await verifyMutation.mutateAsync(payload);
          await finishTransaction({ purchase: p, isConsumable: false });
        } catch {
          // El error se propaga a través de verifyMutation.error
        } finally {
          updateSub.remove();
          errorSub.remove();
        }
      });

      const errorSub = purchaseErrorListener((_err: PurchaseError) => {
        updateSub.remove();
        errorSub.remove();
      });

      if (isLifetime) {
        await requestPurchase({ sku: PRODUCT_IDS.LIFETIME });
      } else {
        await requestSubscription({ sku: PRODUCT_IDS.MONTHLY });
      }
    },
    [verifyMutation],
  );

  return {
    subscriptionStatus: statusQuery.data,
    isLoadingStatus: statusQuery.isLoading,
    statusError: statusQuery.isError ? statusQuery.error : null,

    purchase,
    isPurchasing: verifyMutation.isPending,
    purchaseError: verifyMutation.isError ? verifyMutation.error : null,

    cancelSubscription: cancelMutation.mutate,
    isCancelling: cancelMutation.isPending,
    cancelError: cancelMutation.isError ? cancelMutation.error : null,
  };
}
