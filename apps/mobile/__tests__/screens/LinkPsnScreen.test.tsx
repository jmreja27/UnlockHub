import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PlatformAccount } from '@unlockhub/types';

import LinkPsnScreen from '../../app/link-platform/psn';

jest.mock('../../lib/api');
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LinkPsnScreen />
    </QueryClientProvider>,
  );
}

function makeAccount(overrides: Partial<PlatformAccount> = {}): PlatformAccount {
  return {
    id: 'acct-1',
    userId: 'u1',
    platform: 'PSN',
    externalId: 'psn-account-id',
    username: 'PSNUser99',
    lastSyncedAt: null,
    requiresReauth: false,
    psnProfilePrivate: false,
    ...overrides,
  };
}

describe('LinkPsnScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renderiza el campo de username', () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId('psn-username-input')).toBeTruthy();
  });

  it('muestra el banner de perfil privado tras vincular con perfil privado', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { api } = require('../../lib/api') as { api: { post: jest.Mock } };
    api.post = jest.fn().mockResolvedValue(makeAccount({ psnProfilePrivate: true }));

    const { getByTestId, getByText } = renderScreen();

    fireEvent.changeText(getByTestId('psn-username-input'), 'PSNUser99');
    fireEvent.press(getByText('link_platform.psn.submit'));

    await waitFor(() => expect(getByTestId('psn-private-banner')).toBeTruthy());
  });

  it('muestra el botón "ir a biblioteca" cuando el perfil es privado', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { api } = require('../../lib/api') as { api: { post: jest.Mock } };
    api.post = jest.fn().mockResolvedValue(makeAccount({ psnProfilePrivate: true }));

    const { getByTestId, getByText } = renderScreen();

    fireEvent.changeText(getByTestId('psn-username-input'), 'PSNUser99');
    fireEvent.press(getByText('link_platform.psn.submit'));

    await waitFor(() => expect(getByTestId('psn-private-go-library')).toBeTruthy());
  });

  it('NO muestra el banner de perfil privado cuando el perfil es público', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { api } = require('../../lib/api') as { api: { post: jest.Mock } };
    api.post = jest.fn().mockResolvedValue(makeAccount({ psnProfilePrivate: false }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
    const { router } = require('expo-router') as typeof import('expo-router');

    const { getByTestId, getByText, queryByTestId } = renderScreen();

    fireEvent.changeText(getByTestId('psn-username-input'), 'PSNUser99');
    fireEvent.press(getByText('link_platform.psn.submit'));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(queryByTestId('psn-private-banner')).toBeNull();
  });

  it('NO muestra el banner antes de enviar el formulario', () => {
    const { queryByTestId } = renderScreen();
    expect(queryByTestId('psn-private-banner')).toBeNull();
  });

  it('muestra el toggle de pasos para hacer el perfil público en la vista privada', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { api } = require('../../lib/api') as { api: { post: jest.Mock } };
    api.post = jest.fn().mockResolvedValue(makeAccount({ psnProfilePrivate: true }));

    const { getByTestId, getByText } = renderScreen();

    fireEvent.changeText(getByTestId('psn-username-input'), 'PSNUser99');
    fireEvent.press(getByText('link_platform.psn.submit'));

    await waitFor(() => expect(getByTestId('psn-private-guide-toggle')).toBeTruthy());
  });
});
