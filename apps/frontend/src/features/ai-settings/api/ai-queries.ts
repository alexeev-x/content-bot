import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { checkAiConnection, getAiOverview, saveAiSettings } from './ai-api';

export const aiKeys = { overview: ['ai', 'overview'] as const };

export function aiOverviewQueryOptions() {
  return queryOptions({ queryKey: aiKeys.overview, queryFn: ({ signal }) => getAiOverview(signal), staleTime: 30_000 });
}

export function useSaveAiSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: saveAiSettings,
    retry: false,
    onSuccess: (data) => client.setQueryData(aiKeys.overview, data)
  });
}

export function useCheckAiConnection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: checkAiConnection,
    retry: false,
    onSuccess: (data) => client.setQueryData(aiKeys.overview, data)
  });
}
