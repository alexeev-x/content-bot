import type {
  ContentContaminationReason,
  ContentPlatform,
  ContentReportPeriod,
  ContentVideoFormat
} from '@alexeev/contracts';
import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { nextCursor } from '../../../shared/api/query-string';
import {
  connectTikTok,
  createInviteLink,
  disconnectTikTok,
  getInviteLinks,
  revokeInviteLink,
  getContentGoals,
  getContentItem,
  getContentItems,
  getContentOverview,
  getContentReport,
  getContentReportDetail,
  getContentReports,
  getItemReview,
  getItemScript,
  linkItemScript,
  markItemContamination,
  markItemFormat,
  removeContentGoal,
  unlinkItemScript,
  setContentGoal,
  syncContent
} from './content-analytics-api';

export const contentAnalyticsKeys = {
  all: ['content-analytics'] as const,
  overview: () => [...contentAnalyticsKeys.all, 'overview'] as const,
  items: (platform: ContentPlatform | undefined) => [...contentAnalyticsKeys.all, 'items', platform ?? 'all'] as const,
  item: (id: string) => [...contentAnalyticsKeys.all, 'item', id] as const,
  report: (days: ContentReportPeriod) => [...contentAnalyticsKeys.all, 'report', days] as const,
  goals: () => [...contentAnalyticsKeys.all, 'goals'] as const,
  inviteLinks: (days?: ContentReportPeriod) =>
    days === undefined
      ? ([...contentAnalyticsKeys.all, 'invite-links'] as const)
      : ([...contentAnalyticsKeys.all, 'invite-links', days] as const),
  script: (id: string) => [...contentAnalyticsKeys.all, 'script', id] as const,
  review: (id: string) => [...contentAnalyticsKeys.all, 'review', id] as const,
  reports: () => [...contentAnalyticsKeys.all, 'reports'] as const,
  reportDetail: (id: string) => [...contentAnalyticsKeys.all, 'reports', id] as const
};

/** A new report comes once a day: the history is re-read when the tab opens after a few minutes. */
const REPORTS_STALE_MS = 5 * 60_000;

export function contentReportsQueryOptions() {
  return infiniteQueryOptions({
    queryKey: contentAnalyticsKeys.reports(),
    queryFn: ({ pageParam, signal }) => getContentReports(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    staleTime: REPORTS_STALE_MS
  });
}

/** A released report never changes; its forecasts get scored later, so it is re-read after a while. */
export function contentReportDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: contentAnalyticsKeys.reportDetail(id),
    queryFn: ({ signal }) => getContentReportDetail(id, signal),
    staleTime: REPORTS_STALE_MS
  });
}

export function itemScriptQueryOptions(itemId: string) {
  return queryOptions({
    queryKey: contentAnalyticsKeys.script(itemId),
    queryFn: ({ signal }) => getItemScript(itemId, signal),
    staleTime: 60_000
  });
}

/** Built once by Cron and never regenerated on read, so a minute of staleness is harmless. */
export function itemReviewQueryOptions(itemId: string) {
  return queryOptions({
    queryKey: contentAnalyticsKeys.review(itemId),
    queryFn: ({ signal }) => getItemReview(itemId, signal),
    staleTime: 60_000
  });
}

/** Confirms (revisionId) or removes (null) the script of a video; the answer replaces the cached one. */
export function useLinkItemScript(itemId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (revisionId: string | null) =>
      revisionId === null ? unlinkItemScript(itemId) : linkItemScript(itemId, revisionId),
    retry: false,
    onSuccess: (script) => {
      client.setQueryData(contentAnalyticsKeys.script(itemId), script);
      // The link sets the video's format, so its usual curve may now be the format's.
      void client.invalidateQueries({ queryKey: contentAnalyticsKeys.item(itemId) });
    }
  });
}

export function useMarkItemFormat(itemId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (format: ContentVideoFormat | null) => markItemFormat(itemId, format),
    retry: false,
    onSuccess: () => client.invalidateQueries({ queryKey: contentAnalyticsKeys.item(itemId) })
  });
}

export function useMarkItemContamination(itemId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reason: ContentContaminationReason | null) => markItemContamination(itemId, reason),
    retry: false,
    onSuccess: async () => {
      // The item joins or leaves every usual curve, so other items' details and the report change too.
      await Promise.all([
        client.invalidateQueries({ queryKey: [...contentAnalyticsKeys.all, 'item'] }),
        client.invalidateQueries({ queryKey: [...contentAnalyticsKeys.all, 'report'] })
      ]);
    }
  });
}

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

export function inviteLinksQueryOptions(days: ContentReportPeriod) {
  return queryOptions({
    queryKey: contentAnalyticsKeys.inviteLinks(days),
    queryFn: ({ signal }) => getInviteLinks(days, signal),
    // Joins arrive as they happen (webhook), so a minute old is old enough to refetch.
    staleTime: 60_000
  });
}

/** Creates or revokes a link; the lists of every period refetch after the server confirms. */
export function useInviteLinkActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: contentAnalyticsKeys.inviteLinks() });
  return {
    create: useMutation({ mutationFn: (name: string) => createInviteLink(name), retry: false, onSuccess: refresh }),
    revoke: useMutation({ mutationFn: (id: string) => revokeInviteLink(id), retry: false, onSuccess: refresh })
  };
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
