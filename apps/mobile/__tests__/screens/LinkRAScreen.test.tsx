import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';

import { api, ApiRequestError } from '../../lib/api';
import LinkRAScreen from '../../app/link-platform/ra';

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

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LinkRAScreen />
    </QueryClientProvider>,
  );
}

describe('LinkRAScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('renderiza el campo de username', () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId('ra-username-input')).toBeTruthy();
  });

  it('no renderiza campos de API key', () => {
    const { queryByText } = renderScreen();
    expect(queryByText(/api.key/i)).toBeNull();
    expect(queryByText(/web api key/i)).toBeNull();
  });

  it('muestra error de campo vacío si se envía sin username', () => {
    const { getByText } = renderScreen();
    fireEvent.press(getByText('link_platform.ra.submit'));
    expect(getByText('link_platform.ra.error_empty')).toBeTruthy();
  });

  it('envía solo el campo username al API', async () => {
    mockedApi.post.mockResolvedValue({
      id: 'acct-1',
      userId: 'u1',
      platform: 'RA',
      externalId: 'rauser',
      username: 'rauser',
      lastSyncedAt: null,
    });

    const { getByTestId, getByText } = renderScreen();
    fireEvent.changeText(getByTestId('ra-username-input'), 'rauser');
    fireEvent.press(getByText('link_platform.ra.submit'));

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledWith(
        '/api/v1/platforms/ra/link',
        { username: 'rauser' },
      );
    });
  });

  it('muestra error_user_not_found en respuesta 404 RA_USER_NOT_FOUND', async () => {
    mockedApi.post.mockRejectedValue(new ApiRequestError({ error: 'Not found', code: 'RA_USER_NOT_FOUND' }, 404));

    const { getByTestId, getByText } = renderScreen();
    fireEvent.changeText(getByTestId('ra-username-input'), 'unknownrauser');
    fireEvent.press(getByText('link_platform.ra.submit'));

    await waitFor(() => {
      // BUG-4: usa clave específica error_user_not_found con mensaje descriptivo
      expect(getByText('link_platform.ra.error_user_not_found')).toBeTruthy();
    });
  });

  it('muestra error_already_linked en respuesta 409', async () => {
    mockedApi.post.mockRejectedValue(new ApiRequestError({ error: 'Conflict', code: 'ALREADY_LINKED' }, 409));

    const { getByTestId, getByText } = renderScreen();
    fireEvent.changeText(getByTestId('ra-username-input'), 'duplicaterauser');
    fireEvent.press(getByText('link_platform.ra.submit'));

    await waitFor(() => {
      expect(getByText('link_platform.ra.error_already_linked')).toBeTruthy();
    });
  });

  it('muestra error_service_unavailable en respuesta 503', async () => {
    mockedApi.post.mockRejectedValue(new ApiRequestError({ error: 'Service unavailable', code: 'SERVICE_UNAVAILABLE' }, 503));

    const { getByTestId, getByText } = renderScreen();
    fireEvent.changeText(getByTestId('ra-username-input'), 'somerauser');
    fireEvent.press(getByText('link_platform.ra.submit'));

    await waitFor(() => {
      expect(getByText('link_platform.ra.error_service_unavailable')).toBeTruthy();
    });
  });

  it('muestra el alert de éxito tras vincular correctamente', async () => {
    mockedApi.post.mockResolvedValue({
      id: 'acct-1',
      userId: 'u1',
      platform: 'RA',
      externalId: 'rauser',
      username: 'rauser',
      lastSyncedAt: null,
    });

    const { getByTestId, getByText } = renderScreen();
    fireEvent.changeText(getByTestId('ra-username-input'), 'rauser');
    fireEvent.press(getByText('link_platform.ra.submit'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'link_platform.ra.success',
        '',
        expect.any(Array),
      );
    });
  });
});
