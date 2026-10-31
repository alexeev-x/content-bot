import type { OwnerOperationsSettingsDto } from '@alexeev/contracts';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAutopublishActivity, fetchOwnerOperationsSettings, saveOwnerOperationsSettings } from './operations-api';

export const ownerOperationsSettingsKey = ['owner-settings', 'operations'] as const;
const activityKey = ['owner-settings', 'autopublish-activity'] as const;

export function ownerOperationsSettingsQueryOptions() {
  return queryOptions({
    queryKey: ownerOperationsSettingsKey,
    queryFn: ({ signal }) => fetchOwnerOperationsSettings(signal),
    staleTime: 60_000,
    refetchOnWindowFocus: false
  });
}

export function useSaveOwnerOperationsSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveOwnerOperationsSettings,
    retry: false,
    onSuccess: (saved: OwnerOperationsSettingsDto) => {
      queryClient.setQueryData(ownerOperationsSettingsKey, saved);
      // The blockers the activity answer carries come from these settings.
      void queryClient.invalidateQueries({ queryKey: activityKey });
    }
  });
}

/** What the automatic publishing did in the last 24 hours; refreshed every minute while the tab is visible. */
export function autopublishActivityQueryOptions() {
  return queryOptions({
    queryKey: activityKey,
    queryFn: ({ signal }) => fetchAutopublishActivity(signal),
    staleTime: 30_000,
    refetchInterval: 60_000
  });
}
