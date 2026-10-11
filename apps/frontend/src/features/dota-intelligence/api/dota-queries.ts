import { queryOptions } from '@tanstack/react-query';
import { getDotaIntelligence } from './dota-api';

export const dotaIntelligenceKeys = {
  all: ['dota-intelligence'] as const,
  source: (source: string | undefined) => [...dotaIntelligenceKeys.all, source ?? 'all'] as const
};

export function dotaIntelligenceQueryOptions() {
  return queryOptions({
    queryKey: dotaIntelligenceKeys.source(undefined),
    queryFn: ({ signal }) => getDotaIntelligence(undefined, signal),
    staleTime: 30_000,
    retry: false
  });
}
