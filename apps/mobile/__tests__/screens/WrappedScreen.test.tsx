import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import WrappedScreen from '../../app/wrapped/[year]';

jest.mock('../../hooks/useWrapped', () => ({
  useWrapped: jest.fn(() => ({ data: undefined, isLoading: false, isError: false })),
}));

jest.mock('../../hooks/useWrappedInterstitial', () => ({
  useWrappedInterstitial: jest.fn(),
}));

jest.mock('../../lib/analytics', () => ({
  analytics: { wrappedShared: jest.fn(), track: jest.fn() },
}));

// expo-router: canGoBack controla la rama del guard
jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
  },
  useLocalSearchParams: jest.fn(() => ({})),
}));

describe('WrappedScreen — guard canGoBack (BUG-011)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Sin param year → parsePeriod('') → year=NaN → rama de año inválido
    // El botón Volver de esa rama es el que probamos aquí.
    jest.requireMock('expo-router').useLocalSearchParams.mockReturnValue({});
  });

  it('Volver con historial llama router.back()', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
    const { router } = require('expo-router') as typeof import('expo-router');
    (router.canGoBack as jest.Mock).mockReturnValue(true);

    const { getByText } = render(<WrappedScreen />);
    fireEvent.press(getByText('common.back'));

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('Volver sin historial navega a /(tabs)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
    const { router } = require('expo-router') as typeof import('expo-router');
    (router.canGoBack as jest.Mock).mockReturnValue(false);

    const { getByText } = render(<WrappedScreen />);
    fireEvent.press(getByText('common.back'));

    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('header Volver con historial llama router.back() (año válido)', () => {
    jest.requireMock('expo-router').useLocalSearchParams.mockReturnValue({ year: '2025' });
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
    const { router } = require('expo-router') as typeof import('expo-router');
    (router.canGoBack as jest.Mock).mockReturnValue(true);

    const { getByLabelText } = render(<WrappedScreen />);
    fireEvent.press(getByLabelText('common.back'));

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('header Volver sin historial navega a /(tabs) (año válido)', () => {
    jest.requireMock('expo-router').useLocalSearchParams.mockReturnValue({ year: '2025' });
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
    const { router } = require('expo-router') as typeof import('expo-router');
    (router.canGoBack as jest.Mock).mockReturnValue(false);

    const { getByLabelText } = render(<WrappedScreen />);
    fireEvent.press(getByLabelText('common.back'));

    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
    expect(router.back).not.toHaveBeenCalled();
  });
});
