import type { PublicationAnalyticsQuery } from '@alexeev/contracts';
import { queryOptions } from '@tanstack/react-query';
import { fetchPublicationAnalytics } from './analytics-api';

const analyticsKeys = {
  all: ['analytics'] as const,
  reports: () => [...analyticsKeys.all, 'publications'] as const,
  report: (query: PublicationAnalyticsQuery) => [...analyticsKeys.reports(), query] as const
};

export function publicationAnalyticsQueryOptions(query: PublicationAnalyticsQuery) {
  return queryOptions({
    queryKey: analyticsKeys.report(query),
    queryFn: ({ signal }) => fetchPublicationAnalytics(query, signal),
    staleTime: 30_000,
    retry: false
  });
}
