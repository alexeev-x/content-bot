import type { RewriteSourceEventSeriesPostInput } from '@alexeev/contracts';
import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  approveSourceEventAiDraft,
  approveSourceEventSeriesPost,
  getSourceEventSeries,
  rewriteSourceEventSeriesPost,
  attachSourceEventImages,
  createSourceEventDraft,
  getSourceEventAiDraft,
  getSourceEventContent,
  getSourceEvents,
  requestSourceEventAiDraft,
  sendRichSamples,
  setSourceEventHidden,
  type SourceEventsFilters
} from './sources-api';

const sourceEventKeys = {
  all: ['source-events'] as const,
  list: (filters: SourceEventsFilters) => [...sourceEventKeys.all, filters] as const,
  content: (id: string) => ['source-event-content', id] as const,
  aiDraft: (id: string, draftId: string) => ['source-events', 'ai-draft', id, draftId] as const,
  series: (id: string, seriesId: string) => ['source-events', 'series', id, seriesId] as const
};

export function sourceEventsQueryOptions(filters: SourceEventsFilters) {
  return queryOptions({
    queryKey: sourceEventKeys.list(filters),
    queryFn: ({ signal }) => getSourceEvents(filters, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    // While the AI writes one of the shown events, re-read every 5 s so the lock lifts by itself (visible tab only).
    refetchInterval: (query) => (query.state.data?.items.some((event) => event.aiWriting) ? 5_000 : false),
    retry: false
  });
}

/** An announcement does not change after Valve posts it: read once per panel session. */
export function sourceEventContentQueryOptions(id: string) {
  return queryOptions({
    queryKey: sourceEventKeys.content(id),
    queryFn: ({ signal }) => getSourceEventContent(id, signal),
    staleTime: 30 * 60_000,
    retry: false
  });
}

/** The AI draft can change in the bot (a rewrite, an owner edit): read fresh each time the panel opens. */
export function sourceEventAiDraftQueryOptions(id: string, draftId: string) {
  return queryOptions({
    queryKey: sourceEventKeys.aiDraft(id, draftId),
    queryFn: ({ signal }) => getSourceEventAiDraft(id, signal),
    staleTime: 0,
    retry: false
  });
}

/** While a post of the series is written, re-read every 5 s (visible tab only). */
export function sourceEventSeriesQueryOptions(id: string, seriesId: string) {
  return queryOptions({
    queryKey: sourceEventKeys.series(id, seriesId),
    queryFn: ({ signal }) => getSourceEventSeries(id, signal),
    staleTime: 0,
    refetchInterval: (query) => (query.state.data?.posts.some((post) => post.status === 'writing') ? 5_000 : false),
    retry: false
  });
}

export function useApproveSourceEventSeriesPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, postId, versionId }: { id: string; postId: string; versionId: string }) =>
      approveSourceEventSeriesPost(id, postId, versionId),
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: sourceEventKeys.all })
  });
}

/** Approves every ready post of a series in turn; a failure stops the rest, and the count says how far it got. */
export function useApproveAllSeriesPosts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, posts }: { id: string; posts: readonly { postId: string; versionId: string }[] }) => {
      let approved = 0;
      for (const post of posts) {
        await approveSourceEventSeriesPost(id, post.postId, post.versionId);
        approved += 1;
      }
      return approved;
    },
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: sourceEventKeys.all })
  });
}

/** Never retried by itself: every rewrite is a paid model call. */
export function useRewriteSourceEventSeriesPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, postId, input }: { id: string; postId: string; input: RewriteSourceEventSeriesPostInput }) =>
      rewriteSourceEventSeriesPost(id, postId, input),
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: sourceEventKeys.all })
  });
}

/** Approval never publishes: it makes a studio post. Not retried by itself. */
export function useApproveSourceEventAiDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, versionId }: { id: string; versionId: string }) => approveSourceEventAiDraft(id, versionId),
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: sourceEventKeys.all })
  });
}

/** Creating a draft never publishes; the server answers whether this call created it or it already existed. */
export function useCreateSourceEventDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSourceEventDraft,
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: sourceEventKeys.all })
  });
}

/** Never retried by itself: every call is a paid model call. */
export function useRequestSourceEventAiDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: string | { id: string; autopublishTest: true }) =>
      typeof input === 'string' ? requestSourceEventAiDraft(input) : requestSourceEventAiDraft(input.id, true),
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: sourceEventKeys.all })
  });
}

/** Re-queues the image attach; never retried by itself. */
export function useAttachSourceEventImages() {
  return useMutation({ mutationFn: attachSourceEventImages, retry: false });
}

export function useSetSourceEventHidden() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) => setSourceEventHidden(id, hidden),
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: sourceEventKeys.all })
  });
}

/** Every press sends real Telegram messages: never retried by itself. */
export function useSendRichSamples() {
  return useMutation({ mutationFn: sendRichSamples, retry: false });
}
