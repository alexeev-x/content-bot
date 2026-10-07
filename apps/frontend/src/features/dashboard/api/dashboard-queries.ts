import { queryOptions } from '@tanstack/react-query';
import { getDashboard, type DayRange } from './dashboard-api';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  day: (range: DayRange) => [...dashboardKeys.all, range.from, range.to] as const
};

export const DASHBOARD_POLL_MS = 60_000;

/**
 * The dashboard is the only read that polls outside the incidents screen. TanStack's default
 * `refetchIntervalInBackground: false` pauses it in a hidden tab. `staleTime: 0` makes a return to the page refetch,
 * while the cached data stays on screen.
 */
export function dashboardQueryOptions(range: DayRange, pollMs: number = DASHBOARD_POLL_MS) {
  return queryOptions({
    queryKey: dashboardKeys.day(range),
    queryFn: ({ signal }) => getDashboard(range, signal),
    staleTime: 0,
    refetchInterval: pollMs
  });
}
