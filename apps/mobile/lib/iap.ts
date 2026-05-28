import { Platform } from 'react-native';

// IDs de producto — deben coincidir exactamente con los creados en Google Play Console y App Store Connect
export const PRODUCT_IDS = {
  MONTHLY: Platform.select({
    android: 'unlockhub_premium_monthly',
    ios: 'unlockhub_premium_monthly',
    default: 'unlockhub_premium_monthly',
  }) as string,
  ANNUAL: Platform.select({
    android: 'unlockhub_premium_annual',
    ios: 'unlockhub_premium_annual',
    default: 'unlockhub_premium_annual',
  }) as string,
} as const;

// Precios fallback cuando RevenueCat no está configurado o no devuelve offerings
export const PLAN_PRICES = {
  MONTHLY: '2,99 €',
  ANNUAL: '19,99 €',
  ANNUAL_PER_MONTH: '1,67 €/mes',
  ANNUAL_SAVINGS: '44%',
} as const;

export type PurchasablePlan = 'MONTHLY' | 'ANNUAL';
