import type { OwnerOperationsSettingsDto } from '@alexeev/contracts';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchOwnerOperationsSettings, saveOwnerOperationsSettings } from './operations-api';

export const ownerOperationsSettingsKey = ['owner-settings', 'operations'] as const;

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
    onSuccess: (saved: OwnerOperationsSettingsDto) => queryClient.setQueryData(ownerOperationsSettingsKey, saved)
  });
}
