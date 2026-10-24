import { useQuery } from '@tanstack/react-query';
import { dashboardQueryOptions, draftsQueryOptions, weekQueryOptions } from '../api/dashboard-queries';
import { useTodayRange } from './today-range';
import { weekRange } from './week';

/** The dashboard for the owner's current local day; polls only while the tab is visible. */
export function useDashboardQuery(pollMs?: number, timeZone = 'Europe/Moscow', enabled = true) {
  return useQuery({ ...dashboardQueryOptions(useTodayRange(timeZone), pollMs), enabled });
}

/** Monday to Sunday of the owner's current week; `today` (the day range start) keys it so it rolls over with midnight. */
export function useWeekQuery(timeZone: string, today: string, pollMs?: number, enabled = true) {
  return useQuery({ ...weekQueryOptions(weekRange(new Date(today), timeZone), pollMs), enabled });
}

export function useDraftsQuery() {
  return useQuery(draftsQueryOptions());
}
