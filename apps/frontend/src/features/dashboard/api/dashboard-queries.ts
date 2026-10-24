import { queryOptions } from '@tanstack/react-query';
import { getDashboard, getNewestDrafts, getWeekPublications, type DayRange } from './dashboard-api';

const dashboardKeys = {
  all: ['dashboard'] as const,
  day: (range: DayRange) => [...dashboardKeys.all, range.from, range.to] as const,
  week: (range: DayRange) => [...dashboardKeys.all, 'week', range.from, range.to] as const,
  drafts: () => [...dashboardKeys.all, 'drafts'] as const
};

const DASHBOARD_POLL_MS = 60_000;
const WEEK_POLL_MS = 5 * 60_000;

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
    refetchInterval: pollMs,
    // The one read that shows a send landing: worth a refetch on return, unlike the app default.
    refetchOnWindowFocus: true
  });
}

/** The current week's publications for the bars; slower than the day, which already shows a send landing. */
export function weekQueryOptions(range: DayRange, pollMs: number = WEEK_POLL_MS) {
  return queryOptions({
    queryKey: dashboardKeys.week(range),
    queryFn: ({ signal }) => getWeekPublications(range, signal),
    staleTime: 0,
    refetchInterval: pollMs
  });
}

export function draftsQueryOptions() {
  return queryOptions({
    queryKey: dashboardKeys.drafts(),
    queryFn: ({ signal }) => getNewestDrafts(signal),
    staleTime: 30_000
  });
}
