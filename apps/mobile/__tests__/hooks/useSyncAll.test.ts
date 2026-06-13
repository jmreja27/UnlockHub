import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PlatformAccount } from '@unlockhub/types';

jest.mock('../../lib/api', () => {
  const { ApiRequestError } = jest.requireActual('../../lib/api');
  return {
    api: { post: jest.fn(), get: jest.fn() },
    ApiRequestError,
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { api, ApiRequestError } = require('../../lib/api') as {
  api: { post: jest.Mock; get: jest.Mock };
  ApiRequestError: typeof import('../../lib/api').ApiRequestError;
};

import { useSyncAll } from '../../hooks/useSyncAll';

const STEAM_ACCOUNT = [{ id: 'acc-1', userId: 'user-1', platform: 'STEAM' }] as PlatformAccount[];

function makeWrapper(queryClient: QueryClient) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return Wrapper;
}

describe('useSyncAll — cuota Steam (A41)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    // Pre-poblar caché de plataformas para que el hook las tenga disponibles al llamar sync()
    queryClient.setQueryData(['platforms', 'user-1'], STEAM_ACCOUNT);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('steamQuotaState pasa a "exceeded" cuando el backend devuelve 429 STEAM_QUOTA_EXCEEDED', async () => {
    // El backend lanza 429 cuando Steam es la única plataforma y la cuota está agotada
    api.post.mockRejectedValueOnce(
      new ApiRequestError({ error: 'Cuota agotada', code: 'STEAM_QUOTA_EXCEEDED' }, 429),
    );

    const { result } = renderHook(() => useSyncAll('user-1'), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.sync();
    });

    await waitFor(() => {
      expect(result.current.steamQuotaState).toBe('exceeded');
    });
  });

  it('steamQuotaState pasa a "skipped" cuando el backend devuelve skippedByQuota: true', async () => {
    // El backend devuelve 200 con skippedByQuota cuando Steam se omite y hay otras plataformas
    api.post.mockResolvedValueOnce({ jobId: undefined, platform: 'STEAM', skippedByQuota: true });

    const { result } = renderHook(() => useSyncAll('user-1'), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.sync();
    });

    await waitFor(() => {
      expect(result.current.steamQuotaState).toBe('skipped');
    });
  });
});
