import type { AiLearningListDto } from '@alexeev/contracts';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  checkAiConnection,
  deleteAiFeedback,
  getAiFeedback,
  getAiLearning,
  getAiOverview,
  getAiUnlinkedScripts,
  saveAiSettings,
  setAiLearningExcluded
} from './ai-api';

export const aiKeys = {
  overview: ['ai', 'overview'] as const,
  feedback: ['ai', 'feedback'] as const,
  learning: ['ai', 'learning'] as const,
  unlinkedScripts: ['ai', 'scripts', 'unlinked'] as const
};

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

export function aiLearningQueryOptions() {
  return queryOptions({ queryKey: aiKeys.learning, queryFn: ({ signal }) => getAiLearning(signal), staleTime: 30_000 });
}

/** Only the confirmed row is written into the list; nothing is guessed before the server answers. */
export function useSetAiLearningExcluded() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: setAiLearningExcluded,
    retry: false,
    onSuccess: (item) =>
      client.setQueryData<AiLearningListDto>(aiKeys.learning, (list) =>
        list
          ? { items: list.items.map((row) => (row.id === item.id && row.source === item.source ? item : row)) }
          : list
      )
  });
}

/** A link made in the video's panel (Аналитика) changes this list; it is re-read when opened, after a short rest. */
export function aiUnlinkedScriptsQueryOptions() {
  return queryOptions({
    queryKey: aiKeys.unlinkedScripts,
    queryFn: ({ signal }) => getAiUnlinkedScripts(signal),
    staleTime: 30_000
  });
}
