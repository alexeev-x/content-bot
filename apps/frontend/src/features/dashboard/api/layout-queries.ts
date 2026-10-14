import type { DashboardLayoutDto } from '@alexeev/contracts';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { writeCachedLayout } from '../model/layout-cache';
import { fetchDashboardLayout, saveDashboardLayout } from './layout-api';

const dashboardLayoutKeys = {
  all: ['dashboard-layout'] as const
};

export function dashboardLayoutQueryOptions() {
  return queryOptions({
    queryKey: dashboardLayoutKeys.all,
    queryFn: async ({ signal }) => {
      const layout = await fetchDashboardLayout(signal);
      // The local copy follows the server so the next skeleton and first paint already have this geometry.
      writeCachedLayout(layout);
      return layout;
    },
    // A background refetch must not move widgets under the owner's hands.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false
  });
}

export function useSaveDashboardLayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveDashboardLayout,
    retry: false,
    // The cache and the local copy take the server's answer, never the request body.
    onSuccess: (saved: DashboardLayoutDto) => {
      queryClient.setQueryData(dashboardLayoutKeys.all, saved);
      writeCachedLayout(saved);
    }
  });
}
