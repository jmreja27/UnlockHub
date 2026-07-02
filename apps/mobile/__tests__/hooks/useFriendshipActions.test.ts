import React from 'react';
import { Alert } from 'react-native';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FriendshipStatusResult } from '@unlockhub/types';

jest.mock('../../lib/api', () => ({
  api: {
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { api } = require('../../lib/api') as { api: { post: jest.Mock; delete: jest.Mock } };

import { useFriendshipActions } from '../../hooks/useFriendshipActions';

const STATUS_KEY = (username: string) => ['friendship-status', username] as const;

function makeWrapper(queryClient: QueryClient) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return Wrapper;
}

describe('useFriendshipActions — optimistic updates', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('sendRequest actualiza el caché a pending_sent antes de que la mutación termine', async () => {
    // Estado inicial: sin relación de amistad
    const initialStatus: FriendshipStatusResult = { status: 'none' };
    queryClient.setQueryData(STATUS_KEY('otherUser'), initialStatus);

    // API que nunca resuelve — permite verificar el estado optimista antes del settle
    api.post.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useFriendshipActions('otherUser'), {
      wrapper: makeWrapper(queryClient),
    });

    act(() => {
      result.current.sendRequest.mutate();
    });

    // El caché debe actualizarse optimistamente de inmediato
    await waitFor(() => {
      const cached = queryClient.getQueryData<FriendshipStatusResult>(STATUS_KEY('otherUser'));
      expect(cached?.status).toBe('pending_sent');
    });
  });

  it('sendRequest revierte al estado anterior si la mutación falla', async () => {
    const initialStatus: FriendshipStatusResult = { status: 'none' };
    queryClient.setQueryData(STATUS_KEY('otherUser'), initialStatus);

    api.post.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useFriendshipActions('otherUser'), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      try {
        await result.current.sendRequest.mutateAsync();
      } catch {
        // Error esperado
      }
    });

    // El caché debe revertirse al estado previo
    await waitFor(() => {
      const cached = queryClient.getQueryData<FriendshipStatusResult>(STATUS_KEY('otherUser'));
      expect(cached?.status).toBe('none');
    });
  });

  it('cancelOrRemove actualiza el caché a none de forma optimista', async () => {
    const initialStatus: FriendshipStatusResult = { status: 'pending_sent', friendshipId: 'f1' };
    queryClient.setQueryData(STATUS_KEY('otherUser'), initialStatus);

    // API que nunca resuelve — permite verificar el estado optimista
    api.delete.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useFriendshipActions('otherUser'), {
      wrapper: makeWrapper(queryClient),
    });

    act(() => {
      result.current.cancelOrRemove.mutate('f1');
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<FriendshipStatusResult>(STATUS_KEY('otherUser'));
      expect(cached?.status).toBe('none');
    });
  });

  it('accept actualiza el caché a accepted con el friendshipId de forma optimista', async () => {
    const initialStatus: FriendshipStatusResult = { status: 'pending_received', friendshipId: 'f2' };
    queryClient.setQueryData(STATUS_KEY('otherUser'), initialStatus);

    api.post.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useFriendshipActions('otherUser'), {
      wrapper: makeWrapper(queryClient),
    });

    act(() => {
      result.current.accept.mutate('f2');
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<FriendshipStatusResult>(STATUS_KEY('otherUser'));
      expect(cached?.status).toBe('accepted');
      if (cached?.status === 'accepted') {
        expect(cached.friendshipId).toBe('f2');
      }
    });
  });

  it('BUG-020: reject actualiza el caché a none de forma optimista', async () => {
    const initialStatus: FriendshipStatusResult = { status: 'pending_received', friendshipId: 'f3' };
    queryClient.setQueryData(STATUS_KEY('otherUser'), initialStatus);

    api.delete.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useFriendshipActions('otherUser'), {
      wrapper: makeWrapper(queryClient),
    });

    act(() => {
      result.current.reject.mutate('f3');
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<FriendshipStatusResult>(STATUS_KEY('otherUser'));
      expect(cached?.status).toBe('none');
    });
  });

  it('BUG-020: reject revierte al estado anterior si la mutación falla', async () => {
    const initialStatus: FriendshipStatusResult = { status: 'pending_received', friendshipId: 'f3' };
    queryClient.setQueryData(STATUS_KEY('otherUser'), initialStatus);

    api.delete.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useFriendshipActions('otherUser'), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      try {
        await result.current.reject.mutateAsync('f3');
      } catch {
        // Error esperado
      }
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<FriendshipStatusResult>(STATUS_KEY('otherUser'));
      expect(cached?.status).toBe('pending_received');
    });
  });

  it('BUG-021: sendRequest muestra Alert cuando la mutación falla', async () => {
    const initialStatus: FriendshipStatusResult = { status: 'none' };
    queryClient.setQueryData(STATUS_KEY('otherUser'), initialStatus);

    api.post.mockRejectedValue(new Error('Network error'));

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());

    const { result } = renderHook(() => useFriendshipActions('otherUser'), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      try {
        await result.current.sendRequest.mutateAsync();
      } catch {
        // Error esperado
      }
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'common.error_boundary_title',
        'friends.error_send_request',
      );
    });

    alertSpy.mockRestore();
  });
});
