import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import LinkXboxScreen from '../../app/link-platform/xbox';

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));

jest.mock('expo-auth-session', () => ({
  useAuthRequest: jest.fn(() => [null, null, jest.fn()]),
  makeRedirectUri: jest.fn(() => 'unlockhub://link-platform/xbox'),
  ResponseType: { Code: 'code' },
}));

jest.mock('../../lib/api', () => ({ api: { post: jest.fn() }, ApiRequestError: class {} }));
jest.mock('../../lib/queryKeys', () => ({
  queryKeys: { linkedPlatforms: jest.fn(() => ['linked-platforms']) },
}));

// expo-router: canGoBack controla la rama del guard
jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('LinkXboxScreen — guard canGoBack (BUG-013)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Volver con historial llama router.back()', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
    const { router } = require('expo-router') as typeof import('expo-router');
    (router.canGoBack as jest.Mock).mockReturnValue(true);

    const { getByLabelText } = renderWithClient(<LinkXboxScreen />);
    fireEvent.press(getByLabelText('common.back'));

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('Volver sin historial navega a /(tabs)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
    const { router } = require('expo-router') as typeof import('expo-router');
    (router.canGoBack as jest.Mock).mockReturnValue(false);

    const { getByLabelText } = renderWithClient(<LinkXboxScreen />);
    fireEvent.press(getByLabelText('common.back'));

    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
    expect(router.back).not.toHaveBeenCalled();
  });
});
