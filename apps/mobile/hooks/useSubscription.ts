import { type PurchasablePlan } from '../lib/iap';

interface SubscriptionStatus {
  isPremium: boolean;
  plan: string | null;
  expiresAt: string | null;
  provider: string | null;
}

// Premium desactivado para v1 — stub hasta implementar Google Play Billing completo
export function useSubscription() {
  return {
    subscriptionStatus: { isPremium: false, plan: null, expiresAt: null, provider: null } satisfies SubscriptionStatus,
    isLoadingStatus: false,
    statusError: null,

    purchase: async (_plan: PurchasablePlan): Promise<void> => {},
    isPurchasing: false,
    purchaseError: null,

    cancelSubscription: () => {},
    isCancelling: false,
    cancelError: null,
  };
}
