import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { checkAiConnection, deleteAiFeedback, getAiFeedback, getAiOverview, saveAiSettings } from './ai-api';

export const aiKeys = { overview: ['ai', 'overview'] as const, feedback: ['ai', 'feedback'] as const };

export function aiFeedbackQueryOptions() {
  return queryOptions({ queryKey: aiKeys.feedback, queryFn: ({ signal }) => getAiFeedback(signal), staleTime: 30_000 });
}

/** The list and the «Качество» counts both change. */
export function useDeleteAiFeedback() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: deleteAiFeedback,
    retry: false,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: aiKeys.feedback }),
        client.invalidateQueries({ queryKey: aiKeys.overview })
      ])
  });
}

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
