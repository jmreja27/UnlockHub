import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import type { PlatformAccount } from '@unlockhub/types';

import { api, ApiRequestError } from '../../lib/api';
import LinkPsnScreen from '../../app/link-platform/psn';

jest.mock('../../lib/api', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const actual = jest.requireActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ApiRequestError: actual.ApiRequestError,
    api: { post: jest.fn(), get: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  };
});
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
}));

const mockedApi = api as jest.Mocked<typeof api>;

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

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LinkPsnScreen />
    </QueryClientProvider>,
  );
}

describe('LinkPsnScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('renderiza el campo de username', () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId('psn-username-input')).toBeTruthy();
  });

  it('muestra error de campo vacío si se envía sin username', () => {
    const { getByText } = renderScreen();
    fireEvent.press(getByText('link_platform.psn.submit'));
    expect(getByText('link_platform.psn.error_empty')).toBeTruthy();
  });

  it('navega de vuelta cuando el perfil PSN es público (201)', async () => {
    mockedApi.post.mockResolvedValue(makeAccount({ psnProfilePrivate: false }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
    const { router } = require('expo-router') as typeof import('expo-router');

    const { getByTestId, getByText } = renderScreen();
    fireEvent.changeText(getByTestId('psn-username-input'), 'PSNUser99');
    fireEvent.press(getByText('link_platform.psn.submit'));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  // ── BUG-4: perfil privado ahora devuelve 400 y muestra error inline ─────────

  it('BUG-4: muestra error inline error_profile_private cuando el servidor devuelve PSN_PROFILE_PRIVATE (400)', async () => {
    mockedApi.post.mockRejectedValue(
      new ApiRequestError({ error: 'Private profile', code: 'PSN_PROFILE_PRIVATE' }, 400),
    );

    const { getByTestId, getByText } = renderScreen();
    fireEvent.changeText(getByTestId('psn-username-input'), 'PrivateUser');
    fireEvent.press(getByText('link_platform.psn.submit'));

    await waitFor(() => {
      expect(getByText('link_platform.psn.error_profile_private')).toBeTruthy();
    });
  });

  it('BUG-4: la vinculación no se completa cuando el perfil es privado — onSuccess no se llama', async () => {
    mockedApi.post.mockRejectedValue(
      new ApiRequestError({ error: 'Private profile', code: 'PSN_PROFILE_PRIVATE' }, 400),
    );

    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
    const { router } = require('expo-router') as typeof import('expo-router');

    const { getByTestId, getByText } = renderScreen();
    fireEvent.changeText(getByTestId('psn-username-input'), 'PrivateUser');
    fireEvent.press(getByText('link_platform.psn.submit'));

    await waitFor(() => {
      expect(getByText('link_platform.psn.error_profile_private')).toBeTruthy();
    });

    // router.back nunca debe haberse llamado — la vinculación no se completó
    expect(router.back).not.toHaveBeenCalled();
  });

  it('BUG-4: el campo de username queda editable y con su valor tras el error PSN_PROFILE_PRIVATE', async () => {
    mockedApi.post.mockRejectedValue(
      new ApiRequestError({ error: 'Private profile', code: 'PSN_PROFILE_PRIVATE' }, 400),
    );

    const { getByTestId, getByText } = renderScreen();
    fireEvent.changeText(getByTestId('psn-username-input'), 'PrivateUser');
    fireEvent.press(getByText('link_platform.psn.submit'));

    await waitFor(() => {
      expect(getByText('link_platform.psn.error_profile_private')).toBeTruthy();
    });

    // El input debe seguir con el valor original
    expect(getByTestId('psn-username-input').props.value).toBe('PrivateUser');
  });

  it('muestra error_not_found en respuesta 404', async () => {
    mockedApi.post.mockRejectedValue(new ApiRequestError({ error: 'Not found', code: 'PSN_USER_NOT_FOUND' }, 404));

    const { getByTestId, getByText } = renderScreen();
    fireEvent.changeText(getByTestId('psn-username-input'), 'unknownpsn');
    fireEvent.press(getByText('link_platform.psn.submit'));

    await waitFor(() => {
      expect(getByText('link_platform.psn.error_not_found')).toBeTruthy();
    });
  });

  it('muestra error_already_linked en respuesta 409', async () => {
    mockedApi.post.mockRejectedValue(new ApiRequestError({ error: 'Conflict', code: 'PLATFORM_ACCOUNT_ALREADY_LINKED' }, 409));

    const { getByTestId, getByText } = renderScreen();
    fireEvent.changeText(getByTestId('psn-username-input'), 'takenpsn');
    fireEvent.press(getByText('link_platform.psn.submit'));

    await waitFor(() => {
      expect(getByText('link_platform.psn.error_already_linked')).toBeTruthy();
    });
  });

  it('muestra error_service_unavailable en respuesta 503', async () => {
    mockedApi.post.mockRejectedValue(new ApiRequestError({ error: 'Service unavailable', code: 'PSN_SYSTEM_NOT_CONFIGURED' }, 503));

    const { getByTestId, getByText } = renderScreen();
    fireEvent.changeText(getByTestId('psn-username-input'), 'somepsn');
    fireEvent.press(getByText('link_platform.psn.submit'));

    await waitFor(() => {
      expect(getByText('link_platform.psn.error_service_unavailable')).toBeTruthy();
    });
  });
});
