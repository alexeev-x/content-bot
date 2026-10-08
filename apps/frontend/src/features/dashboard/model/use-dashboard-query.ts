import { useQuery } from '@tanstack/react-query';
import { dashboardQueryOptions } from '../api/dashboard-queries';
import { useTodayRange } from './today-range';

/**
 * The dashboard for the owner's current local day; polls only while the tab is visible. `enabled` is false when
 * no widget on the page reads it (or while editing), so an unused request is never made.
 */
export function useDashboardQuery(pollMs?: number, enabled = true) {
  return useQuery({ ...dashboardQueryOptions(useTodayRange(), pollMs), enabled });
}
