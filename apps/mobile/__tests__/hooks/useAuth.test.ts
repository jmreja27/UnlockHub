import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock analytics antes de importar useAuth
jest.mock('../../lib/analytics', () => ({
  analytics: {
    identify: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
    track: jest.fn().mockResolvedValue(undefined),
    appOpen: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../lib/api', () => {
  const { ApiRequestError } = jest.requireActual('../../lib/api');
  return {
    ApiRequestError,
    api: { post: jest.fn(), get: jest.fn() },
    saveRefreshToken: jest.fn().mockResolvedValue(undefined),
    getRefreshToken: jest.fn().mockResolvedValue('refresh-token-abc'),
    deleteRefreshToken: jest.fn().mockResolvedValue(undefined),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { api, saveRefreshToken, deleteRefreshToken } = require('../../lib/api') as {
  api: { post: jest.Mock; get: jest.Mock };
  saveRefreshToken: jest.Mock;
  deleteRefreshToken: jest.Mock;
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { analytics } = require('../../lib/analytics') as {
  analytics: { identify: jest.Mock; reset: jest.Mock };
};

import { useAuth } from '../../hooks/useAuth';

const MOCK_USER = {
  id: 'user-123',
  username: 'testuser',
  email: 'test@example.com',
  avatar: null,
  banner: null,
  bio: null,
  level: 5,
  xp: 1200,
  streakDays: 3,
  countryCode: null,
  isPremium: false,
  premiumUntil: null,
  lastSyncAt: null,
  profileVisibility: 'PUBLIC' as const,
  createdAt: '2025-01-01T00:00:00.000Z',
};

const AUTH_RESPONSE = {
  accessToken: 'access-token-xyz',
  refreshToken: 'refresh-token-abc',
  user: MOCK_USER,
};

function makeWrapper(queryClient: QueryClient) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return Wrapper;
}

describe('useAuth — analíticas de identificación', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    saveRefreshToken.mockResolvedValue(undefined);
    deleteRefreshToken.mockResolvedValue(undefined);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('llama a analytics.identify con el userId y propiedades tras login exitoso', async () => {
    api.post.mockResolvedValueOnce(AUTH_RESPONSE);

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(queryClient) });

    act(() => {
      result.current.login({ email: 'test@example.com', password: 'Test1234!' });
    });

    await waitFor(() => {
      expect(analytics.identify).toHaveBeenCalledWith('user-123', {
        isPremium: false,
        level: 5,
      });
    });
  });

  it('llama a analytics.identify con el userId y propiedades tras register exitoso', async () => {
    api.post.mockResolvedValueOnce(AUTH_RESPONSE);

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(queryClient) });

    act(() => {
      result.current.register({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Test1234!',
        birthDate: '2000-01-01',
      });
    });

    await waitFor(() => {
      expect(analytics.identify).toHaveBeenCalledWith('user-123', {
        isPremium: false,
        level: 5,
      });
    });
  });

  it('llama a analytics.reset tras logout exitoso', async () => {
    api.post.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(queryClient) });

    act(() => {
      result.current.logout();
    });

    await waitFor(() => {
      expect(analytics.reset).toHaveBeenCalledTimes(1);
    });
  });

  it('llama a analytics.reset incluso cuando el logout falla en el servidor', async () => {
    api.post.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(queryClient) });

    act(() => {
      result.current.logout();
    });

    await waitFor(() => {
      expect(analytics.reset).toHaveBeenCalledTimes(1);
    });
  });
});
