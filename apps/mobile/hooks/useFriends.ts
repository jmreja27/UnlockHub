import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Friendship, PaginatedResponse } from '@unlockhub/types';

import { api } from '../lib/api';

const KEYS = {
  friends: ['friends'] as const,
  pending: ['friends', 'pending'] as const,
};

export function useFriends() {
  const queryClient = useQueryClient();

  const friendsQuery = useQuery({
    queryKey: KEYS.friends,
    queryFn: () => api.get<PaginatedResponse<Friendship>>('/api/v1/friends?limit=50'),
  });

  const pendingQuery = useQuery({
    queryKey: KEYS.pending,
    queryFn: () => api.get<PaginatedResponse<Friendship>>('/api/v1/friends/pending?limit=50'),
  });

  const sendRequest = useMutation({
    mutationFn: (receiverId: string) =>
      api.post<Friendship>('/api/v1/friends', { receiverId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.friends });
    },
  });

  const acceptRequest = useMutation({
    mutationFn: (friendshipId: string) =>
      api.post<Friendship>(`/api/v1/friends/${friendshipId}/accept`),
    // Optimistic update: quita la solicitud de pending y la añade a friends
    onMutate: async (friendshipId) => {
      await queryClient.cancelQueries({ queryKey: KEYS.pending });
      const prevPending = queryClient.getQueryData<PaginatedResponse<Friendship>>(KEYS.pending);
      if (prevPending) {
        queryClient.setQueryData<PaginatedResponse<Friendship>>(KEYS.pending, {
          ...prevPending,
          data: prevPending.data.filter((f) => f.id !== friendshipId),
          total: prevPending.total - 1,
        });
      }
      return { prevPending };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prevPending) {
        queryClient.setQueryData(KEYS.pending, ctx.prevPending);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.friends });
      void queryClient.invalidateQueries({ queryKey: KEYS.pending });
    },
  });

  const rejectRequest = useMutation({
    mutationFn: (friendshipId: string) =>
      api.delete<void>(`/api/v1/friends/${friendshipId}/reject`),
    onMutate: async (friendshipId) => {
      await queryClient.cancelQueries({ queryKey: KEYS.pending });
      const prevPending = queryClient.getQueryData<PaginatedResponse<Friendship>>(KEYS.pending);
      if (prevPending) {
        queryClient.setQueryData<PaginatedResponse<Friendship>>(KEYS.pending, {
          ...prevPending,
          data: prevPending.data.filter((f) => f.id !== friendshipId),
          total: prevPending.total - 1,
        });
      }
      return { prevPending };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prevPending) queryClient.setQueryData(KEYS.pending, ctx.prevPending);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.pending });
    },
  });

  const removeFriend = useMutation({
    mutationFn: (friendshipId: string) =>
      api.delete<void>(`/api/v1/friends/${friendshipId}`),
    onMutate: async (friendshipId) => {
      await queryClient.cancelQueries({ queryKey: KEYS.friends });
      const prevFriends = queryClient.getQueryData<PaginatedResponse<Friendship>>(KEYS.friends);
      if (prevFriends) {
        queryClient.setQueryData<PaginatedResponse<Friendship>>(KEYS.friends, {
          ...prevFriends,
          data: prevFriends.data.filter((f) => f.id !== friendshipId),
          total: prevFriends.total - 1,
        });
      }
      return { prevFriends };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prevFriends) queryClient.setQueryData(KEYS.friends, ctx.prevFriends);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.friends });
    },
  });

  return {
    friends: friendsQuery.data?.data ?? [],
    friendsTotal: friendsQuery.data?.total ?? 0,
    isFriendsLoading: friendsQuery.isLoading,
    friendsError: friendsQuery.error,
    refetchFriends: friendsQuery.refetch,

    pendingRequests: pendingQuery.data?.data ?? [],
    pendingTotal: pendingQuery.data?.total ?? 0,
    isPendingLoading: pendingQuery.isLoading,

    sendRequest: sendRequest.mutate,
    isSending: sendRequest.isPending,

    acceptRequest: acceptRequest.mutate,
    isAccepting: acceptRequest.isPending,

    rejectRequest: rejectRequest.mutate,
    isRejecting: rejectRequest.isPending,

    removeFriend: removeFriend.mutate,
    isRemoving: removeFriend.isPending,
  };
}
