import { queryOptions } from '@tanstack/react-query';
import { getActivity } from './activity-api';

const activityKeys = {
  all: ['activity'] as const,
  day: (from: string, to: string) => [...activityKeys.all, 'day', from, to] as const
};

// Polls with Обзор, every two minutes: each read walks the day's audit log, so a minute was too costly.
const ACTIVITY_POLL_MS = 2 * 60_000;

/** The day's events for the second lane of «Лента дня» (at most 50: a busy day shows its latest). */
export function dayActivityQueryOptions(from: string, to: string) {
  return queryOptions({
    queryKey: activityKeys.day(from, to),
    queryFn: ({ signal }) => getActivity({ from, to, limit: 50 }, undefined, signal),
    staleTime: 30_000,
    refetchInterval: ACTIVITY_POLL_MS
  });
}
