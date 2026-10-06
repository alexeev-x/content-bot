import type { AppearanceDto } from '@alexeev/contracts';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAppearance, saveAppearance } from './appearance-api';

export const appearanceKeys = {
  all: ['appearance'] as const,
  detail: () => [...appearanceKeys.all, 'detail'] as const
};

export function appearanceQueryOptions() {
  return queryOptions({
    queryKey: appearanceKeys.detail(),
    queryFn: ({ signal }) => fetchAppearance(signal),
    // A background refetch must not replace what the operator sees while editing.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false
  });
}

export function useSaveAppearance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveAppearance,
    retry: false,
    // The cache takes the server's answer, never the request body.
    onSuccess: (saved: AppearanceDto) => queryClient.setQueryData(appearanceKeys.detail(), saved)
  });
}
