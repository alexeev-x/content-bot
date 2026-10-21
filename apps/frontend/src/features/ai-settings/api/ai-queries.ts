import type { AiLearningItemDto, AiLearningListDto, AiLessonsDto, AiRuleDto, AiRulesDto } from '@alexeev/contracts';
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  answerAiLesson,
  chooseAiComparison,
  clearAiComparisons,
  getAiComparisons,
  startAiComparisons,
  changeAiRule,
  checkAiConnection,
  deleteAiFeedback,
  getAiDraftChain,
  getAiDrafts,
  type AiDraftsListQuery,
  getAiFeedback,
  getAiLearning,
  getAiLessons,
  type AiLearningListQuery,
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
  comparisons: ['ai', 'comparisons'] as const,
  lessons: ['ai', 'lessons'] as const,
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

/** One page of the examples table; the previous page stays on screen while the next loads. */
export function aiLearningQueryOptions(query: AiLearningListQuery) {
  return queryOptions({
    queryKey: [...aiKeys.learning, query] as const,
    queryFn: ({ signal }) => getAiLearning(query, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000
  });
}

/**
 * Only the confirmed row is written into every cached page; nothing is guessed before the server answers. A switched
 * row stays where it is until the filters change, so it does not jump out from under the pointer.
 */
export function useSetAiLearningExcluded() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: setAiLearningExcluded,
    retry: false,
    onSuccess: (item) => {
      const same = (row: AiLearningItemDto) => row.id === item.id && row.source === item.source;
      const before = client
        .getQueriesData<AiLearningListDto>({ queryKey: aiKeys.learning })
        .flatMap(([, list]) => list?.items ?? [])
        .find(same);
      // The count covers every text, so every cached page moves with it, not only the ones showing this row.
      const delta = before === undefined || before.excluded === item.excluded ? 0 : item.excluded ? -1 : 1;
      client.setQueriesData<AiLearningListDto>({ queryKey: aiKeys.learning }, (list) =>
        list
          ? {
              ...list,
              items: list.items.map((row) => (same(row) ? item : row)),
              includedCount: list.includedCount + delta
            }
          : list
      );
    }
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

/** The nightly run adds lessons and the bot answers them: re-read when opened, after a short rest. */
export function aiLessonsQueryOptions() {
  return queryOptions({ queryKey: aiKeys.lessons, queryFn: ({ signal }) => getAiLessons(signal), staleTime: 30_000 });
}

/** An answered lesson leaves the list; an accepted one is a new rule, so the rules are read again. */
export function useAnswerAiLesson() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: answerAiLesson,
    retry: false,
    onSuccess: async (answer) => {
      client.setQueryData<AiLessonsDto>(aiKeys.lessons, (list) =>
        list ? { items: list.items.filter((lesson) => lesson.id !== answer.id) } : list
      );
      if (answer.status === 'accepted') await client.invalidateQueries({ queryKey: aiKeys.rules });
    }
  });
}

/** While a pair is written, re-read every 10 s (visible tab only). */
export function aiComparisonsQueryOptions() {
  return queryOptions({
    queryKey: aiKeys.comparisons,
    queryFn: ({ signal }) => getAiComparisons(signal),
    staleTime: 0,
    refetchInterval: (query) => (query.state.data?.items.some((item) => item.status === 'writing') ? 10_000 : false)
  });
}

/** Paid: never retried by itself. */
export function useStartAiComparisons() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: startAiComparisons,
    retry: false,
    onSettled: () => client.invalidateQueries({ queryKey: aiKeys.comparisons })
  });
}

export function useClearAiComparisons() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: clearAiComparisons,
    retry: false,
    onSettled: () => client.invalidateQueries({ queryKey: aiKeys.comparisons })
  });
}

export function useChooseAiComparison() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, choice, note }: { id: string; choice: 'a' | 'b' | 'same'; note?: string }) =>
      chooseAiComparison(id, choice, note),
    retry: false,
    onSettled: () => client.invalidateQueries({ queryKey: aiKeys.comparisons })
  });
}
