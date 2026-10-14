import { useQuery } from '@tanstack/react-query';
import { dashboardQueryOptions } from '../api/dashboard-queries';
import { useTodayRange } from './today-range';

/** The dashboard for the owner's current local day; polls only while the tab is visible. */
export function useDashboardQuery(pollMs?: number, timeZone = 'Europe/Moscow') {
  return useQuery(dashboardQueryOptions(useTodayRange(timeZone), pollMs));
}
