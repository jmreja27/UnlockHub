import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FriendshipStatusResult } from '@unlockhub/types';

import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

/**
 * Hook que expone las acciones de relación de amistad para un usuario concreto.
 *
 * Implementa optimistic updates en sendRequest, cancelOrRemove y accept:
 * el estado local cambia inmediatamente y se revierte si la API falla.
 *
 * Las acciones invalidan tanto ['friendship-status', username] como ['friends']
 * para mantener sincronizadas la lista de amigos y el estado del botón de perfil.
 *
 * @param username - Username del otro usuario (no el autenticado).
 */
export function useFriendshipActions(username: string) {
  const queryClient = useQueryClient();
  const statusKey = queryKeys.friendshipStatus(username);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: statusKey });
    void queryClient.invalidateQueries({ queryKey: queryKeys.friends() });
  };

  const sendRequest = useMutation({
    mutationFn: () => api.post('/api/v1/friends', { username }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: statusKey });
      const previous = queryClient.getQueryData<FriendshipStatusResult>(statusKey);
      queryClient.setQueryData<FriendshipStatusResult>(statusKey, {
        status: 'pending_sent',
        friendshipId: 'optimistic',
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(statusKey, context?.previous);
    },
    onSettled: invalidate,
  });

  const cancelOrRemove = useMutation({
    mutationFn: (friendshipId: string) => api.delete(`/api/v1/friends/${friendshipId}`),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: statusKey });
      const previous = queryClient.getQueryData<FriendshipStatusResult>(statusKey);
      queryClient.setQueryData<FriendshipStatusResult>(statusKey, { status: 'none' });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(statusKey, context?.previous);
    },
    onSettled: invalidate,
  });

  const accept = useMutation({
    mutationFn: (friendshipId: string) => api.post(`/api/v1/friends/${friendshipId}/accept`),
    onMutate: async (friendshipId) => {
      await queryClient.cancelQueries({ queryKey: statusKey });
      const previous = queryClient.getQueryData<FriendshipStatusResult>(statusKey);
      queryClient.setQueryData<FriendshipStatusResult>(statusKey, {
        status: 'accepted',
        friendshipId,
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(statusKey, context?.previous);
    },
    onSettled: invalidate,
  });

  const reject = useMutation({
    mutationFn: (friendshipId: string) => api.delete(`/api/v1/friends/${friendshipId}/reject`),
    onSuccess: invalidate,
  });

  return { sendRequest, cancelOrRemove, accept, reject };
}
