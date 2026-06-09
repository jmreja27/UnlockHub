import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Friendship, PaginatedResponse } from '@unlockhub/types';

import { api } from '../lib/api';
import { useSessionStore } from '../stores/sessionStore';
import { queryKeys } from '../lib/queryKeys';

export function useFriends() {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useSessionStore();

  const friendsQuery = useQuery({
    queryKey: queryKeys.friends(),
    queryFn: () => api.get<PaginatedResponse<Friendship>>('/api/v1/friends?limit=50'),
    enabled: isAuthenticated,
  });

  const pendingQuery = useQuery({
    queryKey: queryKeys.friendsPending(),
    queryFn: () => api.get<PaginatedResponse<Friendship>>('/api/v1/friends/pending?limit=50'),
    enabled: isAuthenticated,
  });

  const sendRequest = useMutation({
    mutationFn: (receiverId: string) =>
      api.post<Friendship>('/api/v1/friends', { receiverId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.friends() });
    },
  });

  const acceptRequest = useMutation({
    mutationFn: (friendshipId: string) =>
      api.post<Friendship>(`/api/v1/friends/${friendshipId}/accept`),
    // Optimistic update: quita la solicitud de pending y la añade a friends
    onMutate: async (friendshipId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.friendsPending() });
      const prevPending = queryClient.getQueryData<PaginatedResponse<Friendship>>(queryKeys.friendsPending());
      if (prevPending) {
        queryClient.setQueryData<PaginatedResponse<Friendship>>(queryKeys.friendsPending(), {
          ...prevPending,
          data: prevPending.data.filter((f) => f.id !== friendshipId),
          total: prevPending.total - 1,
        });
      }
      return { prevPending };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prevPending) {
        queryClient.setQueryData(queryKeys.friendsPending(), ctx.prevPending);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.friends() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.friendsPending() });
    },
  });

  const rejectRequest = useMutation({
    mutationFn: (friendshipId: string) =>
      api.delete<void>(`/api/v1/friends/${friendshipId}/reject`),
    onMutate: async (friendshipId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.friendsPending() });
      const prevPending = queryClient.getQueryData<PaginatedResponse<Friendship>>(queryKeys.friendsPending());
      if (prevPending) {
        queryClient.setQueryData<PaginatedResponse<Friendship>>(queryKeys.friendsPending(), {
          ...prevPending,
          data: prevPending.data.filter((f) => f.id !== friendshipId),
          total: prevPending.total - 1,
        });
      }
      return { prevPending };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prevPending) queryClient.setQueryData(queryKeys.friendsPending(), ctx.prevPending);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.friendsPending() });
    },
  });

  const removeFriend = useMutation({
    mutationFn: (friendshipId: string) =>
      api.delete<void>(`/api/v1/friends/${friendshipId}`),
    onMutate: async (friendshipId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.friends() });
      const prevFriends = queryClient.getQueryData<PaginatedResponse<Friendship>>(queryKeys.friends());
      if (prevFriends) {
        queryClient.setQueryData<PaginatedResponse<Friendship>>(queryKeys.friends(), {
          ...prevFriends,
          data: prevFriends.data.filter((f) => f.id !== friendshipId),
          total: prevFriends.total - 1,
        });
      }
      return { prevFriends };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prevFriends) queryClient.setQueryData(queryKeys.friends(), ctx.prevFriends);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.friends() });
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
