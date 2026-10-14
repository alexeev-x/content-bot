import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { createSourceEventDraft, getSourceEvents, setSourceEventHidden, type SourceEventsFilters } from './sources-api';

const sourceEventKeys = {
  all: ['source-events'] as const,
  list: (filters: SourceEventsFilters) => [...sourceEventKeys.all, filters] as const
};

export function sourceEventsQueryOptions(filters: SourceEventsFilters) {
  return queryOptions({
    queryKey: sourceEventKeys.list(filters),
    queryFn: ({ signal }) => getSourceEvents(filters, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
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

export function useSetSourceEventHidden() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) => setSourceEventHidden(id, hidden),
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: sourceEventKeys.all })
  });
}
