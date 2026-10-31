import type { RubricKey, UpdateRubricInput, UpdateRubricSchedulerInput } from '@alexeev/contracts';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getRubricCalendar,
  getRubricComments,
  getRubricCompare,
  getRubricLearning,
  getRubricPosts,
  getRubricForecast,
  getRubricList,
  getRubricSchedulerStatus,
  getRubricSlot,
  listRubricChannels,
  skipRubricSlot,
  updateRubric,
  updateRubricScheduler,
  updateRubricLearning
} from './rubrics-api';

const rubricKeys = {
  all: ['rubrics'] as const,
  status: () => [...rubricKeys.all, 'status'] as const,
  forecast: () => [...rubricKeys.all, 'forecast'] as const,
  calendar: (from: string, to: string) => [...rubricKeys.all, 'calendar', from, to] as const,
  list: () => [...rubricKeys.all, 'list'] as const,
  slot: (id: string) => [...rubricKeys.all, 'slot', id] as const,
  channels: () => [...rubricKeys.all, 'channels'] as const,
  compare: (days: number) => [...rubricKeys.all, 'compare', days] as const,
  posts: (rubric: string, days: string) => [...rubricKeys.all, 'posts', rubric, days] as const,
  comments: (days: number) => [...rubricKeys.all, 'comments', days] as const,
  learning: () => [...rubricKeys.all, 'learning'] as const
};

export function rubricLearningQueryOptions() {
  return queryOptions({
    queryKey: rubricKeys.learning(),
    queryFn: ({ signal }) => getRubricLearning(signal),
    staleTime: ANALYTICS_STALE_MS
  });
}

/** The learning switch; the answer is the fresh learning state. */
export function useUpdateRubricLearning() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (applyEnabled: boolean) => updateRubricLearning({ applyEnabled }),
    onSuccess: (data) => client.setQueryData(rubricKeys.learning(), data)
  });
}

/** Scores change once an hour (the score step): a minute of staleness costs nothing. */
const ANALYTICS_STALE_MS = 60_000;

export function rubricCompareQueryOptions(days: 7 | 30 | 90) {
  return queryOptions({
    queryKey: rubricKeys.compare(days),
    queryFn: ({ signal }) => getRubricCompare(days, signal),
    staleTime: ANALYTICS_STALE_MS
  });
}

export function rubricPostsQueryOptions(rubric: RubricKey, days: '30' | '90' | 'all') {
  return queryOptions({
    queryKey: rubricKeys.posts(rubric, days),
    queryFn: ({ signal }) => getRubricPosts(rubric, days, signal),
    staleTime: ANALYTICS_STALE_MS
  });
}

export function rubricCommentsQueryOptions(days: 7 | 30) {
  return queryOptions({
    queryKey: rubricKeys.comments(days),
    queryFn: ({ signal }) => getRubricComments(days, signal),
    staleTime: ANALYTICS_STALE_MS
  });
}

export function rubricStatusQueryOptions() {
  return queryOptions({
    queryKey: rubricKeys.status(),
    queryFn: ({ signal }) => getRubricSchedulerStatus(signal),
    staleTime: 30_000
  });
}

/** The server keeps a forecast for 5 minutes: asking more often shows nothing new. */
export function rubricForecastQueryOptions() {
  return queryOptions({
    queryKey: rubricKeys.forecast(),
    queryFn: ({ signal }) => getRubricForecast(signal),
    staleTime: 5 * 60_000
  });
}

/** A slot moves every minute while it is built and released: the calendar is fresh for half a minute. */
export function rubricCalendarQueryOptions(from: string, to: string) {
  return queryOptions({
    queryKey: rubricKeys.calendar(from, to),
    queryFn: ({ signal }) => getRubricCalendar(from, to, signal),
    staleTime: 30_000
  });
}

export function rubricListQueryOptions() {
  return queryOptions({
    queryKey: rubricKeys.list(),
    queryFn: ({ signal }) => getRubricList(signal),
    staleTime: 30_000
  });
}

export function rubricSlotQueryOptions(id: string) {
  return queryOptions({
    queryKey: rubricKeys.slot(id),
    queryFn: ({ signal }) => getRubricSlot(id, signal),
    staleTime: 15_000
  });
}

export function rubricChannelsQueryOptions() {
  return queryOptions({
    queryKey: rubricKeys.channels(),
    queryFn: ({ signal }) => listRubricChannels(signal),
    staleTime: 60_000
  });
}

/** Every change re-reads the whole section after the server's answer: the plan moves with it. Never optimistic. */
function useRubricMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    retry: false,
    onSuccess: () => client.invalidateQueries({ queryKey: rubricKeys.all })
  });
}

export const useUpdateRubricScheduler = () =>
  useRubricMutation((input: UpdateRubricSchedulerInput) => updateRubricScheduler(input));
export const useUpdateRubric = () =>
  useRubricMutation(({ key, input }: { key: RubricKey; input: UpdateRubricInput }) => updateRubric(key, input));
export const useSkipRubricSlot = () => useRubricMutation((id: string) => skipRubricSlot(id));
