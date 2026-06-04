import { useState, useEffect } from 'react';
import Purchases, { type PurchasesPackage, PACKAGE_TYPE } from 'react-native-purchases';

import { PRODUCT_IDS, PLAN_PRICES } from '../lib/iap';

export interface PremiumPlan {
  packageType: 'monthly' | 'annual';
  price: string;
  pricePerMonth: string;
  savings?: string;
  productId: string;
  rcPackage: PurchasesPackage | null; // null cuando RevenueCat no está configurado
}

const RC_API_KEY = process.env['EXPO_PUBLIC_REVENUECAT_API_KEY'];

// Planes de fallback con precios hardcodeados cuando RevenueCat no está disponible
function buildFallbackPlans(): PremiumPlan[] {
  return [
    {
      packageType: 'monthly',
      price: PLAN_PRICES.MONTHLY,
      pricePerMonth: PLAN_PRICES.MONTHLY,
      productId: PRODUCT_IDS.MONTHLY,
      rcPackage: null,
    },
    {
      packageType: 'annual',
      price: PLAN_PRICES.ANNUAL,
      pricePerMonth: PLAN_PRICES.ANNUAL_PER_MONTH,
      savings: PLAN_PRICES.ANNUAL_SAVINGS,
      productId: PRODUCT_IDS.ANNUAL,
      rcPackage: null,
    },
  ];
}

function mapPackageToplan(pkg: PurchasesPackage): PremiumPlan | null {
  const isMonthly =
    pkg.packageType === PACKAGE_TYPE.MONTHLY ||
    pkg.product.identifier === PRODUCT_IDS.MONTHLY;
  const isAnnual =
    pkg.packageType === PACKAGE_TYPE.ANNUAL ||
    pkg.product.identifier === PRODUCT_IDS.ANNUAL;

  if (!isMonthly && !isAnnual) return null;

  const price = pkg.product.priceString;

  if (isMonthly) {
    return {
      packageType: 'monthly',
      price,
      pricePerMonth: price,
      productId: pkg.product.identifier,
      rcPackage: pkg,
    };
  }

  // Annual: calcular precio mensual y ahorro respecto al plan mensual
  const annualPriceNum = pkg.product.price;
  const monthlyPriceNum = annualPriceNum / 12;
  const currencySymbol = price.replace(/[\d.,\s]/g, '').trim() || '€';
  const pricePerMonth = `${currencySymbol}${monthlyPriceNum.toFixed(2).replace('.', ',')}/mes`;

  const standardMonthlyAnnual = parseFloat(PLAN_PRICES.MONTHLY.replace(',', '.').replace(/[^0-9.]/g, '')) * 12;
  const savingsPct = standardMonthlyAnnual > 0
    ? Math.round((1 - annualPriceNum / standardMonthlyAnnual) * 100)
    : 44;

  return {
    packageType: 'annual',
    price,
    pricePerMonth,
    savings: `${savingsPct}%`,
    productId: pkg.product.identifier,
    rcPackage: pkg,
  };
}

interface UsePremiumPlansResult {
  plans: PremiumPlan[];
  isLoading: boolean;
  error: string | null;
}

// Obtiene los planes disponibles desde RevenueCat.
// Si RevenueCat no está configurado o falla, devuelve planes con precios hardcodeados.
export function usePremiumPlans(): UsePremiumPlansResult {
  const [plans, setPlans] = useState<PremiumPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchPlans() {
      setIsLoading(true);
      setError(null);

      if (!RC_API_KEY) {
        if (!cancelled) {
          setPlans(buildFallbackPlans());
          setIsLoading(false);
        }
        return;
      }

      try {
        const offerings = await Purchases.getOfferings();
        const current = offerings.current;

        if (!current || current.availablePackages.length === 0) {
          if (!cancelled) setPlans(buildFallbackPlans());
        } else {
          const mapped = current.availablePackages
            .map(mapPackageToplan)
            .filter((p): p is PremiumPlan => p !== null)
            .sort((a) => (a.packageType === 'monthly' ? -1 : 1));
          if (!cancelled) setPlans(mapped.length > 0 ? mapped : buildFallbackPlans());
        }
      } catch (err) {
        if (!cancelled) {
          setError('No se pudieron cargar los planes');
          setPlans(buildFallbackPlans());
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void fetchPlans();
    return () => { cancelled = true; };
  }, []);

  return { plans, isLoading, error };
}
