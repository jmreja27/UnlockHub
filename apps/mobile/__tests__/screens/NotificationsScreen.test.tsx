import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import NotificationsScreen from '../../app/notifications';

jest.mock('../../lib/api', () => ({ api: { get: jest.fn(), patch: jest.fn() } }));
jest.mock('../../hooks/useTheme', () => ({
  useTheme: jest.fn(() => ({
    background: '#000',
    text: '#fff',
    textSecondary: '#aaa',
    textMuted: '#666',
    border: '#333',
    surface: '#111',
  })),
}));

// Mockeamos los hooks de TanStack Query para que isLoading sea false
// y el header con el botón Volver sea visible inmediatamente.
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useInfiniteQuery: jest.fn(() => ({
    data: { pages: [] },
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
  })),
  useMutation: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));

// expo-router: canGoBack controla la rama del guard
jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
  },
}));

jest.mock('../../lib/queryKeys', () => ({
  queryKeys: {
    notifications: jest.fn(() => ['notifications']),
    notificationsUnreadCount: jest.fn(() => ['notifications-unread']),
  },
}));

describe('NotificationsScreen — guard canGoBack (BUG-014)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restablecer el mock de useInfiniteQuery con isLoading: false
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tq = require('@tanstack/react-query') as { useInfiniteQuery: jest.Mock; useMutation: jest.Mock; useQueryClient: jest.Mock };
    tq.useInfiniteQuery.mockReturnValue({ data: { pages: [] }, fetchNextPage: jest.fn(), hasNextPage: false, isFetchingNextPage: false, isLoading: false });
    tq.useMutation.mockReturnValue({ mutate: jest.fn(), isPending: false });
    tq.useQueryClient.mockReturnValue({ invalidateQueries: jest.fn() });
  });

  it('Volver con historial llama router.back()', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
    const { router } = require('expo-router') as typeof import('expo-router');
    (router.canGoBack as jest.Mock).mockReturnValue(true);

    const { getByLabelText } = render(<NotificationsScreen />);
    fireEvent.press(getByLabelText('common.back'));

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('Volver sin historial navega a /(tabs)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
    const { router } = require('expo-router') as typeof import('expo-router');
    (router.canGoBack as jest.Mock).mockReturnValue(false);

    const { getByLabelText } = render(<NotificationsScreen />);
    fireEvent.press(getByLabelText('common.back'));

    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
    expect(router.back).not.toHaveBeenCalled();
  });
});
