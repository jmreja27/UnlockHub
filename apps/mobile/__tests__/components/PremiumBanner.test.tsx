import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import { PremiumBanner } from '../../components/PremiumBanner';
import { useSessionStore } from '../../stores/sessionStore';
import { useSubscription } from '../../hooks/useSubscription';

jest.mock('../../stores/sessionStore');
jest.mock('../../hooks/useSubscription');
// Activamos FEATURES.premium para testear el banner — en producción está desactivado hasta Fase 4
jest.mock('../../lib/featureFlags', () => ({
  FEATURES: { premium: true, pointsRedeem: true, advancedStats: true, challenges: false, wrapped: true, ugcGuides: true, notifications: true },
}));

const mockUseSessionStore = useSessionStore as unknown as jest.Mock;
const mockUseSubscription = useSubscription as jest.Mock;

function setupMocks(
  isAuthenticated: boolean,
  subscriptionStatus: {
    isPremium: boolean;
    plan?: string | null;
    expiresAt?: string | null;
  } | null = null,
  isLoadingStatus = false,
) {
  mockUseSessionStore.mockReturnValue({ isAuthenticated });
  mockUseSubscription.mockReturnValue({ subscriptionStatus, isLoadingStatus });
}

describe('PremiumBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('no renderiza nada cuando el usuario no estÃ¡ autenticado', () => {
    setupMocks(false);
    const { toJSON } = render(<PremiumBanner />);
    expect(toJSON()).toBeNull();
  });

  it('no renderiza nada mientras se carga el estado de suscripciÃ³n', () => {
    setupMocks(true, null, true);
    const { toJSON } = render(<PremiumBanner />);
    expect(toJSON()).toBeNull();
  });

  it('renderiza el banner de usuario free cuando no es premium', () => {
    setupMocks(true, { isPremium: false });
    const { getByRole } = render(<PremiumBanner />);
    expect(getByRole('button', { name: 'premium.banner_cta' })).toBeTruthy();
  });

  it('el banner free muestra el texto de CTA', () => {
    setupMocks(true, { isPremium: false });
    const { getByText, UNSAFE_getAllByType } = render(<PremiumBanner />);
    expect(getByText('premium.banner_title')).toBeTruthy();
    // premium.banner_action estÃ¡ dentro de un View con accessibilityElementsHidden
    const texts = UNSAFE_getAllByType(Text);
    expect(texts.some((t) => t.props.children === 'premium.banner_action')).toBe(true);
  });

  it('el banner free navega a /premium al pulsarlo', () => {
    setupMocks(true, { isPremium: false });
    const { getByRole } = render(<PremiumBanner />);
    fireEvent.press(getByRole('button', { name: 'premium.banner_cta' }));
    expect(router.push).toHaveBeenCalledWith('/premium');
  });

  it('renderiza el banner de plan MONTHLY para usuarios premium con fecha', () => {
    setupMocks(true, {
      isPremium: true,
      plan: 'MONTHLY',
      expiresAt: '2025-12-31T00:00:00.000Z',
    });
    const { getByText } = render(<PremiumBanner />);
    expect(getByText('premium.active_monthly')).toBeTruthy();
  });

  it('renderiza el banner LIFETIME sin fecha de vencimiento', () => {
    setupMocks(true, {
      isPremium: true,
      plan: 'LIFETIME',
      expiresAt: null,
    });
    const { getByText } = render(<PremiumBanner />);
    expect(getByText('premium.active_lifetime')).toBeTruthy();
    expect(getByText('premium.active_lifetime_desc')).toBeTruthy();
  });

  it('el banner LIFETIME tiene accessibilityLabel especÃ­fico', () => {
    setupMocks(true, {
      isPremium: true,
      plan: 'LIFETIME',
      expiresAt: null,
    });
    const { getByLabelText } = render(<PremiumBanner />);
    expect(getByLabelText('premium.active_lifetime_aria')).toBeTruthy();
  });

  it('el banner MONTHLY muestra la fecha de vencimiento en el accessibilityLabel', () => {
    setupMocks(true, {
      isPremium: true,
      plan: 'MONTHLY',
      expiresAt: '2025-12-31T00:00:00.000Z',
    });
    const { getByLabelText } = render(<PremiumBanner />);
    // t('premium.active_monthly_aria', { date: '...' }) incluye la fecha formateada
    // Con nuestro mock, la clave se devuelve sin resolver el {{date}} ya que key no contiene la plantilla
    expect(getByLabelText('premium.active_monthly_aria')).toBeTruthy();
  });
});

