import type { AiLearningListDto, AiRuleDto, AiRulesDto } from '@alexeev/contracts';
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  changeAiRule,
  checkAiConnection,
  deleteAiFeedback,
  getAiDraftChain,
  getAiDrafts,
  type AiDraftsListQuery,
  getAiFeedback,
  getAiLearning,
  getAiOverview,
  getAiHypotheses,
  getAiRules,
  getAiUnlinkedScripts,
  removeAiRuleEvidence,
  saveAiSettings,
  setAiLearningExcluded
} from './ai-api';

export const aiKeys = {
  overview: ['ai', 'overview'] as const,
  feedback: ['ai', 'feedback'] as const,
  learning: ['ai', 'learning'] as const,
  rules: ['ai', 'rules'] as const,
  hypotheses: ['ai', 'hypotheses'] as const,
  drafts: ['ai', 'drafts'] as const,
  draft: (id: string) => ['ai', 'drafts', id] as const,
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

/** One page of the drafts table; the previous page stays on screen while the next loads. */
export function aiDraftsQueryOptions(query: AiDraftsListQuery) {
  return queryOptions({
    queryKey: [...aiKeys.drafts, query] as const,
    queryFn: ({ signal }) => getAiDrafts(query, signal),
    placeholderData: keepPreviousData,
    // The bot writes drafts all day: a page is re-read when opened after a short rest.
    staleTime: 30_000
  });
}

export function aiDraftChainQueryOptions(id: string) {
  return queryOptions({
    queryKey: aiKeys.draft(id),
    queryFn: ({ signal }) => getAiDraftChain(id, signal),
    staleTime: 30_000
  });
}

/** The daily review and Monday's job change them on the server only: re-read when opened, after a short rest. */
export function aiHypothesesQueryOptions() {
  return queryOptions({
    queryKey: aiKeys.hypotheses,
    queryFn: ({ signal }) => getAiHypotheses(signal),
    staleTime: 30_000
  });
}

/** The bot's «/rule» and the weekly run change this list too: re-read when opened, after a short rest. */
export function aiRulesQueryOptions() {
  return queryOptions({ queryKey: aiKeys.rules, queryFn: ({ signal }) => getAiRules(signal), staleTime: 30_000 });
}

function useRuleWrite<T>(mutationFn: (input: T) => Promise<AiRuleDto>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    retry: false,
    // Only the confirmed rule is written into the list; nothing is guessed before the server answers.
    onSuccess: (rule) =>
      client.setQueryData<AiRulesDto>(aiKeys.rules, (list) =>
        list ? { ...list, items: list.items.map((row) => (row.id === rule.id ? rule : row)) } : list
      )
  });
}

export const useChangeAiRule = () => useRuleWrite(changeAiRule);
export const useRemoveAiRuleEvidence = () => useRuleWrite(removeAiRuleEvidence);

/** A link made in the video's panel (Аналитика) changes this list; it is re-read when opened, after a short rest. */
export function aiUnlinkedScriptsQueryOptions() {
  return queryOptions({
    queryKey: aiKeys.unlinkedScripts,
    queryFn: ({ signal }) => getAiUnlinkedScripts(signal),
    staleTime: 30_000
  });
}
