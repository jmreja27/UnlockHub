import { useState, useEffect, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { AchievementSearchResult, SearchResponse } from '@unlockhub/types';

import { api } from '../lib/api';

export type AchievementPlatformFilter = 'all' | 'STEAM' | 'RA' | 'PSN';

const DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 2;
const PAGE_SIZE = 20;

export function useSearchAchievements(platformFilter: AchievementPlatformFilter = 'all') {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  const enabled = debouncedQuery.length >= MIN_QUERY_LENGTH;
  const platformParam = platformFilter !== 'all' ? `&platform=${platformFilter}` : '';

  const result = useInfiniteQuery({
    queryKey: ['search-achievements', debouncedQuery, platformFilter],
    queryFn: ({ pageParam }) => {
      const page = pageParam as number;
      return api.get<SearchResponse>(
        `/api/v1/search?q=${encodeURIComponent(debouncedQuery)}&type=achievements${platformParam}&page=${page}`,
      );
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.achievements.length === PAGE_SIZE ? allPages.length + 1 : undefined,
    initialPageParam: 1,
    enabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 15,
    placeholderData: (prev) => prev,
  });

  const achievements: AchievementSearchResult[] =
    result.data?.pages.flatMap((p) => p.achievements) ?? [];

  return { query, setQuery, debouncedQuery, enabled, achievements, ...result };
}
