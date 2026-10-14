import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { getActivity, type ActivityFilters } from './activity-api';

const activityKeys = {
  all: ['activity'] as const,
  feed: (filters: ActivityFilters) => [...activityKeys.all, 'feed', filters] as const,
  day: (from: string, to: string) => [...activityKeys.all, 'day', from, to] as const
};

// Polls with Обзор: something the owner or Cron did a minute ago should show up without a reload.
const ACTIVITY_POLL_MS = 60_000;

/** The «Активность» widget: newest first, «Показать ещё» loads older pages. */
export function activityFeedQueryOptions(filters: ActivityFilters) {
  return infiniteQueryOptions({
    queryKey: activityKeys.feed(filters),
    queryFn: ({ signal, pageParam }) => getActivity({ ...filters, limit: 15 }, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 30_000,
    refetchInterval: ACTIVITY_POLL_MS
  });
}

/** The day's events for the second lane of «Лента дня» (at most 50: a busy day shows its latest). */
export function dayActivityQueryOptions(from: string, to: string) {
  return queryOptions({
    queryKey: activityKeys.day(from, to),
    queryFn: ({ signal }) => getActivity({ from, to, limit: 50 }, undefined, signal),
    staleTime: 30_000,
    refetchInterval: ACTIVITY_POLL_MS
  });
}
