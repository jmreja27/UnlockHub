import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CursorPaginatedResponse, ActivityEvent } from '@unlockhub/types';

jest.mock('../../lib/api', () => ({
  api: { get: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { api } = require('../../lib/api') as { api: { get: jest.Mock } };

import { usePublicFeed } from '../../hooks/usePublicFeed';

function makeEvent(id: string): ActivityEvent {
  return {
    id,
    userId: 'u1',
    type: 'ACHIEVEMENT_UNLOCKED',
    payload: { achievementId: 'a1' },
    createdAt: '2026-01-01T00:00:00.000Z',
    user: { id: 'u1', username: 'player1', avatar: null },
  };
}

function makePage(ids: string[], nextCursor: string | null): CursorPaginatedResponse<ActivityEvent> {
  return { data: ids.map(makeEvent), nextCursor };
}

function makeWrapper(queryClient: QueryClient) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return Wrapper;
}

describe('usePublicFeed', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('carga la primera página y expone los eventos', async () => {
    api.get.mockResolvedValueOnce(makePage(['e1', 'e2', 'e3'], null));

    const { result } = renderHook(() => usePublicFeed(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.events).toHaveLength(3);
    expect(result.current.events[0]?.id).toBe('e1');
    expect(result.current.hasNextPage).toBe(false);
  });

  it('acumula páginas en fetchNextPage cuando nextCursor no es null', async () => {
    api.get
      .mockResolvedValueOnce(makePage(['e1', 'e2'], 'e2'))
      .mockResolvedValueOnce(makePage(['e3', 'e4'], null));

    const { result } = renderHook(() => usePublicFeed(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.events).toHaveLength(4));
    expect(result.current.events.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('se detiene cuando nextCursor es null (última página)', async () => {
    api.get.mockResolvedValueOnce(makePage(['e1'], null));

    const { result } = renderHook(() => usePublicFeed(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasNextPage).toBe(false);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('pasa el cursor en la URL de la segunda página', async () => {
    api.get
      .mockResolvedValueOnce(makePage(['e1'], 'cursor-abc'))
      .mockResolvedValueOnce(makePage(['e2'], null));

    const { result } = renderHook(() => usePublicFeed(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.isFetchingNextPage).toBe(false));

    expect(api.get).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('cursor=cursor-abc'),
    );
  });

  it('expone isError cuando la petición falla', async () => {
    api.get.mockRejectedValueOnce(new Error('network error'));

    const { result } = renderHook(() => usePublicFeed(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
