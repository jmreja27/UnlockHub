import { useInfiniteQuery } from '@tanstack/react-query';
import type { ActivityEvent, CursorPaginatedResponse } from '@unlockhub/types';

import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

const PUBLIC_FEED_LIMIT = 20;

export function usePublicFeed() {
  const query = useInfiniteQuery<CursorPaginatedResponse<ActivityEvent>>({
    queryKey: queryKeys.publicFeed(),
    queryFn: ({ pageParam }) => {
      const cursor = pageParam as string | undefined;
      const url = cursor
        ? `/api/v1/activity/public?limit=${PUBLIC_FEED_LIMIT}&cursor=${encodeURIComponent(cursor)}`
        : `/api/v1/activity/public?limit=${PUBLIC_FEED_LIMIT}`;
      return api.get<CursorPaginatedResponse<ActivityEvent>>(url);
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 60_000,
  });

  const events = query.data?.pages.flatMap((p) => p.data) ?? [];

  return {
    events,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
