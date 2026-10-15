import { queryOptions } from '@tanstack/react-query';
import {
  getDashboard,
  getNewestDrafts,
  getPostCount,
  getRecentPosts,
  getScheduledCount,
  getWeekPublications,
  type DayRange
} from './dashboard-api';

const dashboardKeys = {
  all: ['dashboard'] as const,
  day: (range: DayRange) => [...dashboardKeys.all, range.from, range.to] as const,
  week: (range: DayRange) => [...dashboardKeys.all, 'week', range.from, range.to] as const,
  drafts: () => [...dashboardKeys.all, 'drafts'] as const,
  work: (part: string) => [...dashboardKeys.all, 'work', part] as const
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

/** The current week's publications for the bars; polls with the day so a send moves a bar from «запланировано» to «отправлено». */
export function weekQueryOptions(range: DayRange, pollMs: number = DASHBOARD_POLL_MS) {
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

/** «Контент в работе»: counts by status and the posts edited last. */
export function workQueryOptions() {
  return {
    drafts: queryOptions({
      queryKey: dashboardKeys.work('drafts'),
      queryFn: ({ signal }) => getPostCount('draft', signal),
      staleTime: 30_000
    }),
    approved: queryOptions({
      queryKey: dashboardKeys.work('approved'),
      queryFn: ({ signal }) => getPostCount('approved', signal),
      staleTime: 30_000
    }),
    scheduled: queryOptions({
      queryKey: dashboardKeys.work('scheduled'),
      queryFn: ({ signal }) => getScheduledCount(signal),
      staleTime: 30_000
    }),
    recent: queryOptions({
      queryKey: dashboardKeys.work('recent'),
      queryFn: ({ signal }) => getRecentPosts(signal),
      staleTime: 30_000
    })
  };
}
