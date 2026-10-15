import type { ContentPlatform } from '@alexeev/contracts';
import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { nextCursor } from '../../../shared/api/query-string';
import { getContentItem, getContentItems, getContentOverview, syncContent } from './content-analytics-api';

export const contentAnalyticsKeys = {
  all: ['content-analytics'] as const,
  overview: () => [...contentAnalyticsKeys.all, 'overview'] as const,
  items: (platform: ContentPlatform | undefined) => [...contentAnalyticsKeys.all, 'items', platform ?? 'all'] as const,
  item: (id: string) => [...contentAnalyticsKeys.all, 'item', id] as const
};

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
      void client.invalidateQueries({ queryKey: [...contentAnalyticsKeys.all, 'item'] });
    }
  });
}
