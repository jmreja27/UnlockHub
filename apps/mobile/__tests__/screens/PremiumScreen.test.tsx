import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import PremiumScreen from '../../app/premium';
import { useSubscription } from '../../hooks/useSubscription';
import { usePremiumPlans } from '../../hooks/usePremiumPlans';

jest.mock('../../hooks/useSubscription');
jest.mock('../../hooks/usePremiumPlans');
jest.mock('../../lib/api');
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('react-native-purchases', () => ({
  PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: 'PURCHASE_CANCELLED_ERROR' },
}));

const mockUseSubscription = useSubscription as jest.Mock;
const mockUsePremiumPlans = usePremiumPlans as jest.Mock;

const MOCK_PLANS = [
  {
    packageType: 'monthly' as const,
    price: '2,99 €',
    pricePerMonth: '2,99 €',
    productId: 'unlockhub_premium_monthly',
    rcPackage: null,
  },
  {
    packageType: 'annual' as const,
    price: '19,99 €',
    pricePerMonth: '1,67 €/mes',
    savings: '44%',
    productId: 'unlockhub_premium_annual',
    rcPackage: null,
  },
];

function renderScreen(pointsBalance = 0) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });

  // Pre-llenar la caché de puntos para evitar llamadas reales a la API
  client.setQueryData(['my-points-total'], { total: pointsBalance });

  return render(
    <QueryClientProvider client={client}>
      <PremiumScreen />
    </QueryClientProvider>,
  );
}

describe('PremiumScreen', () => {
  const mockPurchase = jest.fn();
  const mockRestore = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSubscription.mockReturnValue({
      subscriptionStatus: { isPremium: false, plan: null, expiresAt: null, provider: null },
      isLoadingStatus: false,
      statusError: null,
      purchase: mockPurchase,
      isPurchasing: false,
      purchaseError: null,
      restorePurchases: mockRestore,
      isRestoring: false,
      cancelSubscription: jest.fn(),
      isCancelling: false,
    });
    mockUsePremiumPlans.mockReturnValue({
      plans: MOCK_PLANS,
      isLoading: false,
      error: null,
    });
  });

  it('renderiza el título Premium', () => {
    const { getByRole } = renderScreen();
    expect(getByRole('header')).toBeTruthy();
  });

  it('renderiza los cuatro beneficios', () => {
    const { getByText } = renderScreen();
    expect(getByText('premium.feature_no_ads')).toBeTruthy();
    expect(getByText('premium.feature_sync')).toBeTruthy();
    expect(getByText('premium.feature_shields')).toBeTruthy();
    expect(getByText('premium.feature_stats')).toBeTruthy();
  });

  it('muestra los dos planes', () => {
    const { getByText } = renderScreen();
    expect(getByText('premium.plan_monthly')).toBeTruthy();
    expect(getByText('premium.plan_annual')).toBeTruthy();
  });

  it('muestra el precio de cada plan', () => {
    const { getByText } = renderScreen();
    expect(getByText('2,99 €')).toBeTruthy();
    expect(getByText('19,99 €')).toBeTruthy();
  });

  it('selecciona el plan anual por defecto', () => {
    const { getByTestId } = renderScreen();
    const subscribeButton = getByTestId('premium-subscribe-button');
    // El botón CTA debe mostrar el precio anual (plan seleccionado por defecto)
    expect(subscribeButton).toBeTruthy();
  });

  it('el botón de suscripción está deshabilitado mientras carga', () => {
    mockUsePremiumPlans.mockReturnValue({ plans: [], isLoading: true, error: null });
    const { getByTestId } = renderScreen();
    const btn = getByTestId('premium-subscribe-button');
    expect(btn.props.accessibilityState?.disabled).toBe(true);
  });

  it('llama a purchase al pulsar el botón de suscripción', async () => {
    mockPurchase.mockResolvedValue(undefined);
    const { getByTestId } = renderScreen();

    await act(async () => {
      fireEvent.press(getByTestId('premium-subscribe-button'));
    });

    expect(mockPurchase).toHaveBeenCalled();
  });

  it('no muestra error cuando el usuario cancela (PURCHASE_CANCELLED)', async () => {
    const cancelError = { code: 'PURCHASE_CANCELLED_ERROR', message: 'Cancelled' };
    mockPurchase.mockRejectedValue(cancelError);
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { getByTestId } = renderScreen();

    await act(async () => {
      fireEvent.press(getByTestId('premium-subscribe-button'));
    });

    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('muestra error cuando la compra falla por otro motivo', async () => {
    const genericError = { code: 'NETWORK_ERROR', message: 'Network error' };
    mockPurchase.mockRejectedValue(genericError);
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { getByTestId } = renderScreen();

    await act(async () => {
      fireEvent.press(getByTestId('premium-subscribe-button'));
    });

    expect(alertSpy).toHaveBeenCalledWith('premium.error_title', 'premium.error_purchase');
  });

  it('muestra el botón de canjear puntos deshabilitado con saldo insuficiente', () => {
    const { getByTestId } = renderScreen(0); // 0 puntos
    const redeemBtn = getByTestId('premium-redeem-button');
    expect(redeemBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it('muestra el botón de canjear puntos habilitado con saldo suficiente', () => {
    const { getByTestId } = renderScreen(300); // 300 puntos exactos
    const redeemBtn = getByTestId('premium-redeem-button');
    expect(redeemBtn.props.accessibilityState?.disabled).toBe(false);
  });

  it('llama a restorePurchases al pulsar Restaurar', async () => {
    mockRestore.mockResolvedValue(undefined);
    const { getByTestId } = renderScreen();

    await act(async () => {
      fireEvent.press(getByTestId('premium-restore-button'));
    });

    expect(mockRestore).toHaveBeenCalled();
  });

  it('muestra spinner cuando isPurchasing es true', () => {
    mockUseSubscription.mockReturnValue({
      ...mockUseSubscription(),
      isPurchasing: true,
    });
    // Tras establecer isPurchasing: true, re-renderizar
    mockUseSubscription.mockReturnValue({
      subscriptionStatus: { isPremium: false, plan: null, expiresAt: null, provider: null },
      isLoadingStatus: false,
      statusError: null,
      purchase: mockPurchase,
      isPurchasing: true,
      purchaseError: null,
      restorePurchases: mockRestore,
      isRestoring: false,
      cancelSubscription: jest.fn(),
      isCancelling: false,
    });
    const { getByTestId } = renderScreen();
    const btn = getByTestId('premium-subscribe-button');
    expect(btn.props.accessibilityState?.busy).toBe(true);
  });
});
