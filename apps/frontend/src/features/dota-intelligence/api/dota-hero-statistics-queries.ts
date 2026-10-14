import { queryOptions } from '@tanstack/react-query';
import { getDotaHeroStatistics } from './dota-hero-statistics-api';

export const dotaHeroStatisticsKey = ['dota-hero-statistics'] as const;

export function dotaHeroStatisticsQueryOptions(enabled = true) {
  return queryOptions({
    queryKey: dotaHeroStatisticsKey,
    queryFn: ({ signal }) => getDotaHeroStatistics(signal),
    enabled,
    staleTime: 60_000,
    retry: false
  });
}
