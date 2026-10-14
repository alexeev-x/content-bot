import { queryOptions } from '@tanstack/react-query';
import { getDashboard, type DayRange } from './dashboard-api';

const dashboardKeys = {
  all: ['dashboard'] as const,
  day: (range: DayRange) => [...dashboardKeys.all, range.from, range.to] as const
};

const DASHBOARD_POLL_MS = 60_000;

/**
 * Besides the incidents screen, the dashboard is the only read that polls (the sidebar badge does not). TanStack's default
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
