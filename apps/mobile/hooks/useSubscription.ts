import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Purchases, { PURCHASES_ERROR_CODE } from 'react-native-purchases';

import { api, refreshAccessToken } from '../lib/api';

import type { PremiumPlan } from './usePremiumPlans';

const RC_API_KEY = process.env['EXPO_PUBLIC_REVENUECAT_API_KEY'];

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

  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<Error | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const subscriptionStatus: SubscriptionStatus = {
    isPremium: false,
    plan: null,
    expiresAt: null,
    provider: null,
  };

  // Refresca el JWT tras una compra para que isPremium: true esté en el token sin hacer logout
  async function syncPremiumState(): Promise<void> {
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
      if (!RC_API_KEY || !plan.rcPackage) {
        throw new Error('RevenueCat no configurado. Configura EXPO_PUBLIC_REVENUECAT_API_KEY.');
      }

      const { customerInfo } = await Purchases.purchasePackage(plan.rcPackage);
      const isPremiumNow = typeof customerInfo.entitlements.active['premium'] !== 'undefined';
      if (isPremiumNow) {
        await syncPremiumState();
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
      if (RC_API_KEY) {
        const customerInfo = await Purchases.restorePurchases();
        const isPremiumNow = typeof customerInfo.entitlements.active['premium'] !== 'undefined';
        if (isPremiumNow) {
          await syncPremiumState();
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
    isLoadingStatus: false,
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
