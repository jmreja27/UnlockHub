import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Purchases, { PURCHASES_ERROR_CODE } from 'react-native-purchases';
import type { CustomerInfo } from 'react-native-purchases';

import { api, refreshAccessToken } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';

import type { PremiumPlan } from './usePremiumPlans';

interface SubscriptionStatus {
  isPremium: boolean;
  plan: string | null;
  expiresAt: string | null;
  provider: string | null;
}

interface UseSubscriptionResult {
  subscriptionStatus: SubscriptionStatus;
  isLoadingStatus: boolean;
  statusError: Error | null;

  purchase: (plan: PremiumPlan) => Promise<void>;
  isPurchasing: boolean;
  purchaseError: Error | null;

  restorePurchases: () => Promise<void>;
  isRestoring: boolean;

  cancelSubscription: () => Promise<void>;
  isCancelling: boolean;
}

export function useSubscription(): UseSubscriptionResult {
  const queryClient = useQueryClient();
  const { user } = useSessionStore();
  // Leer en el cuerpo del hook (no a nivel de módulo) para que los tests puedan controlar el valor
  const rcApiKey = process.env['EXPO_PUBLIC_REVENUECAT_API_KEY'];

  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<Error | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(!!rcApiKey);

  // Cargar CustomerInfo al montar — fuente de verdad para el estado premium en UI
  useEffect(() => {
    if (!rcApiKey) return;
    void Purchases.getCustomerInfo()
      .then(setCustomerInfo)
      .catch(() => {})
      .finally(() => { setIsLoadingStatus(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derivar isPremium: RC es la fuente primaria; user.isPremium del JWT es fallback
  const isPremiumFromRC =
    customerInfo !== null
      ? typeof customerInfo.entitlements.active['premium'] !== 'undefined'
      : null;

  const subscriptionStatus: SubscriptionStatus = {
    isPremium: isPremiumFromRC !== null ? isPremiumFromRC : (user?.isPremium ?? false),
    plan: null,
    expiresAt: null,
    provider: null,
  };

  // Refresca el JWT y el CustomerInfo de RC tras una compra
  async function syncPremiumState(newCustomerInfo?: CustomerInfo): Promise<void> {
    if (newCustomerInfo) setCustomerInfo(newCustomerInfo);
    try {
      await refreshAccessToken();
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    } catch {
      // Si falla el refresh, la próxima request con 401 lo reintentará automáticamente
    }
  }

  async function purchase(plan: PremiumPlan): Promise<void> {
    setIsPurchasing(true);
    setPurchaseError(null);

    try {
      if (!rcApiKey || !plan.rcPackage) {
        throw new Error('RevenueCat no configurado. Configura EXPO_PUBLIC_REVENUECAT_API_KEY.');
      }

      const { customerInfo: purchasedInfo } = await Purchases.purchasePackage(plan.rcPackage);
      const isPremiumNow = typeof purchasedInfo.entitlements.active['premium'] !== 'undefined';
      if (isPremiumNow) {
        await syncPremiumState(purchasedInfo);
      }
    } catch (err) {
      setPurchaseError(err instanceof Error ? err : new Error('Error desconocido'));
      throw err;
    } finally {
      setIsPurchasing(false);
    }
  }

  async function restorePurchases(): Promise<void> {
    setIsRestoring(true);
    try {
      if (rcApiKey) {
        const restoredInfo = await Purchases.restorePurchases();
        const isPremiumNow = typeof restoredInfo.entitlements.active['premium'] !== 'undefined';
        if (isPremiumNow) {
          await syncPremiumState(restoredInfo);
        }
      }
    } finally {
      setIsRestoring(false);
    }
  }

  async function cancelSubscription(): Promise<void> {
    setIsCancelling(true);
    try {
      await api.delete('/api/v1/subscriptions');
      await syncPremiumState();
    } finally {
      setIsCancelling(false);
    }
  }

  return {
    subscriptionStatus,
    isLoadingStatus,
    statusError: null,
    purchase,
    isPurchasing,
    purchaseError,
    restorePurchases,
    isRestoring,
    cancelSubscription,
    isCancelling,
  };
}

export { PURCHASES_ERROR_CODE };
