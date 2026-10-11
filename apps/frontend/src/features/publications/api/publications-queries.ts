import type { PublicationDto } from '@alexeev/contracts';
import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient
} from '@tanstack/react-query';
import { useState } from 'react';
import { createIdempotencyTracker } from '../../../shared/api/idempotency';
import { nextCursor } from '../../../shared/api/query-string';
import { isInProgress } from '../model/publication-view';
import { listEnabledDestinations } from './destination-options';
import {
  cancelPublication,
  createPublication,
  deletePublication,
  deletePublications,
  getPublication,
  listPublications,
  reschedulePublication,
  resolveUnknownPublication,
  type CancelPublicationBody,
  type BulkDeletePublicationsBody,
  type CreatePublicationBody,
  type DeletePublicationBody,
  type PublicationFilters,
  type ReschedulePublicationBody,
  type ResolveUnknownBody
} from './publications-api';

export const publicationKeys = {
  all: ['publications'] as const,
  lists: () => [...publicationKeys.all, 'list'] as const,
  list: (filters: PublicationFilters) => [...publicationKeys.lists(), filters] as const,
  details: () => [...publicationKeys.all, 'detail'] as const,
  detail: (id: string) => [...publicationKeys.details(), id] as const
};

// Status changes in the background (cron, queue), so keep lists fresher than reference data.
const STALE_TIME = 15_000;
export const PUBLICATION_POLL_MS = 15_000;

/** Pages accumulate under «Показать ещё»; pass `pollMs` to refresh the loaded pages while a row can still change. */
export function publicationsInfiniteQueryOptions(filters: PublicationFilters = {}, pollMs?: number) {
  return infiniteQueryOptions({
    queryKey: publicationKeys.list(filters),
    queryFn: ({ pageParam, signal }) => listPublications(filters, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    staleTime: STALE_TIME,
    // The default refetchIntervalInBackground (false) stops polling in a hidden tab.
    refetchInterval: (query) =>
      pollMs !== undefined &&
      query.state.data?.pages.some((page) => page.items.some((item) => isInProgress(item.status)))
        ? pollMs
        : false
  });
}

/** One page of the list; the cursor lives in the URL, so back/forward and shared links work. */
export function publicationsPageQueryOptions(
  filters: PublicationFilters = {},
  cursor?: string,
  pollMs: number = PUBLICATION_POLL_MS
) {
  return queryOptions({
    queryKey: [...publicationKeys.lists(), 'page', filters, cursor ?? null] as const,
    queryFn: ({ signal }) => listPublications(filters, cursor, signal),
    staleTime: STALE_TIME,
    // Poll only while a visible row can still change; the default refetchIntervalInBackground (false) stops it in hidden tabs.
    refetchInterval: (query) => (query.state.data?.items.some((item) => isInProgress(item.status)) ? pollMs : false)
  });
}

/** Detail; pass `pollMs` to keep an open drawer fresh while the publication is not final. */
export function publicationQueryOptions(id: string, pollMs?: number) {
  return queryOptions({
    queryKey: publicationKeys.detail(id),
    queryFn: ({ signal }) => getPublication(id, signal),
    staleTime: STALE_TIME,
    ...(pollMs === undefined
      ? {}
      : {
          refetchInterval: (query: { state: { data: PublicationDto | undefined } }) =>
            query.state.data && isInProgress(query.state.data.status) ? pollMs : false
        })
  });
}

/** Channels the owner can publish to; own key and fetcher so this feature never imports the destinations feature. */
export function publishDestinationsQueryOptions() {
  return queryOptions({
    queryKey: [...publicationKeys.all, 'destination-options'] as const,
    queryFn: ({ signal }) => listEnabledDestinations(signal),
    staleTime: 60_000
  });
}

// No optimistic writes: the cache only ever receives the status the server returned.
function applyServerPublication(queryClient: QueryClient, publication: PublicationDto): void {
  queryClient.setQueryData(publicationKeys.detail(publication.id), publication);
  void queryClient.invalidateQueries({ queryKey: publicationKeys.lists() });
}

export function useCreatePublication() {
  const queryClient = useQueryClient();
  const [tracker] = useState(createIdempotencyTracker);
  return useMutation({
    // One key per request: derived once here and released only after the server confirmed this very request.
    mutationFn: async (input: CreatePublicationBody) => {
      const key = tracker.keyFor(input);
      const created = await createPublication(input, key);
      tracker.release(key);
      return created;
    },
    retry: false,
    onSuccess: (publication) => {
      applyServerPublication(queryClient, publication);
    }
  });
}

/** Create with a caller-owned Idempotency-Key (the publish intent keeps it across remounts and reloads). */
export function useSubmitPublication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, key }: { input: CreatePublicationBody; key: string }) => createPublication(input, key),
    retry: false,
    onSuccess: (publication) => {
      applyServerPublication(queryClient, publication);
    }
  });
}

export function useReschedulePublication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReschedulePublicationBody }) => reschedulePublication(id, input),
    retry: false,
    onSuccess: (publication) => applyServerPublication(queryClient, publication)
  });
}

export function useCancelPublication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CancelPublicationBody }) => cancelPublication(id, input),
    retry: false,
    onSuccess: (publication) => applyServerPublication(queryClient, publication)
  });
}

export function useResolveUnknownPublication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ResolveUnknownBody }) => resolveUnknownPublication(id, input),
    retry: false,
    onSuccess: (publication) => applyServerPublication(queryClient, publication)
  });
}

export function useDeletePublication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DeletePublicationBody }) => deletePublication(id, input),
    retry: false,
    onSuccess: (result) => {
      queryClient.removeQueries({ queryKey: publicationKeys.detail(result.id) });
      void queryClient.invalidateQueries({ queryKey: publicationKeys.lists() });
    }
  });
}

export function useBulkDeletePublications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkDeletePublicationsBody) => deletePublications(input),
    retry: false,
    onSuccess: (result) => {
      for (const item of result.items) {
        if (item.outcome === 'deleted') queryClient.removeQueries({ queryKey: publicationKeys.detail(item.id) });
      }
      void queryClient.invalidateQueries({ queryKey: publicationKeys.lists() });
    }
  });
}
