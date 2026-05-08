import { Platform } from 'react-native';

// IDs de producto — deben coincidir exactamente con los creados en Google Play Console y App Store Connect
export const PRODUCT_IDS = {
  MONTHLY: Platform.select({
    android: 'unlockhub_premium_monthly',
    ios: 'unlockhub_premium_monthly',
    default: 'unlockhub_premium_monthly',
  }),
  LIFETIME: Platform.select({
    android: 'unlockhub_premium_lifetime',
    ios: 'unlockhub_premium_lifetime',
    default: 'unlockhub_premium_lifetime',
  }),
} as const;

// Precios que se muestran en la UI — deben coincidir con los configurados en la tienda
export const PLAN_PRICES = {
  MONTHLY: '€2,99/mes',
  LIFETIME: '€4,99',
} as const;

export type PurchasablePlan = 'MONTHLY' | 'LIFETIME';
