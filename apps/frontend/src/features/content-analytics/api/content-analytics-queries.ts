import type { ContentPlatform, ContentReportPeriod } from '@alexeev/contracts';
import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { nextCursor } from '../../../shared/api/query-string';
import {
  connectTikTok,
  disconnectTikTok,
  getContentGoals,
  getContentItem,
  getContentItems,
  getContentOverview,
  getContentReport,
  removeContentGoal,
  sendMessagePreviews,
  setContentGoal,
  syncContent
} from './content-analytics-api';

export const contentAnalyticsKeys = {
  all: ['content-analytics'] as const,
  overview: () => [...contentAnalyticsKeys.all, 'overview'] as const,
  items: (platform: ContentPlatform | undefined) => [...contentAnalyticsKeys.all, 'items', platform ?? 'all'] as const,
  item: (id: string) => [...contentAnalyticsKeys.all, 'item', id] as const,
  report: (days: ContentReportPeriod) => [...contentAnalyticsKeys.all, 'report', days] as const,
  goals: () => [...contentAnalyticsKeys.all, 'goals'] as const
};

export function contentGoalsQueryOptions() {
  return queryOptions({
    queryKey: contentAnalyticsKeys.goals(),
    queryFn: ({ signal }) => getContentGoals(signal),
    staleTime: 5 * 60_000
  });
}

/** Sets (target) or removes (null) the goal of a platform; the answer is the fresh list. */
export function useSaveContentGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ platform, target }: { platform: ContentPlatform; target: number | null }) =>
      target === null ? removeContentGoal(platform) : setContentGoal(platform, target),
    retry: false,
    onSuccess: (goals) => client.setQueryData(contentAnalyticsKeys.goals(), goals)
  });
}

// The server collects about once an hour, so a few minutes of staleness costs nothing.
const OVERVIEW_STALE_MS = 5 * 60_000;

export function contentOverviewQueryOptions() {
  return queryOptions({
    queryKey: contentAnalyticsKeys.overview(),
    queryFn: ({ signal }) => getContentOverview(signal),
    staleTime: OVERVIEW_STALE_MS
  });
}

export function contentItemsQueryOptions(platform: ContentPlatform | undefined) {
  return infiniteQueryOptions({
    queryKey: contentAnalyticsKeys.items(platform),
    queryFn: ({ pageParam, signal }) => getContentItems(platform, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    staleTime: OVERVIEW_STALE_MS
  });
}

export function contentReportQueryOptions(days: ContentReportPeriod) {
  return queryOptions({
    queryKey: contentAnalyticsKeys.report(days),
    queryFn: ({ signal }) => getContentReport(days, signal),
    staleTime: OVERVIEW_STALE_MS,
    // A new period keeps the previous one on screen at reduced opacity instead of a skeleton.
    placeholderData: (previous) => previous
  });
}

export function contentItemQueryOptions(id: string) {
  return queryOptions({
    queryKey: contentAnalyticsKeys.item(id),
    queryFn: ({ signal }) => getContentItem(id, signal),
    staleTime: OVERVIEW_STALE_MS
  });
}

export function useSyncContent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: syncContent,
    retry: false,
    onSuccess: (overview) => {
      client.setQueryData(contentAnalyticsKeys.overview(), overview);
      void client.invalidateQueries({ queryKey: [...contentAnalyticsKeys.all, 'items'] });
      void client.invalidateQueries({ queryKey: [...contentAnalyticsKeys.all, 'report'] });
      void client.invalidateQueries({ queryKey: [...contentAnalyticsKeys.all, 'item'] });
    }
  });
}

/** Gets TikTok's consent URL and leaves the app for it; TikTok sends the browser back to /analytics. */
export function useConnectTikTok() {
  return useMutation({
    mutationFn: connectTikTok,
    retry: false,
    onSuccess: ({ authorizeUrl }) => window.location.assign(authorizeUrl)
  });
}

export function useDisconnectTikTok() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: disconnectTikTok,
    retry: false,
    onSuccess: () => void client.invalidateQueries({ queryKey: contentAnalyticsKeys.all })
  });
}

export function useSendMessagePreviews() {
  return useMutation({ mutationFn: sendMessagePreviews, retry: false });
}
