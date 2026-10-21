import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createSourceEventDraft,
  getSourceEventContent,
  getSourceEvents,
  requestSourceEventAiDraft,
  setSourceEventHidden,
  type SourceEventsFilters
} from './sources-api';

const sourceEventKeys = {
  all: ['source-events'] as const,
  list: (filters: SourceEventsFilters) => [...sourceEventKeys.all, filters] as const,
  content: (id: string) => ['source-event-content', id] as const
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
    mutationFn: requestSourceEventAiDraft,
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: sourceEventKeys.all })
  });
}

export function useSetSourceEventHidden() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) => setSourceEventHidden(id, hidden),
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: sourceEventKeys.all })
  });
}
