import { queryOptions } from '@tanstack/react-query';
import { getDotaEventDetail, getDotaIntelligence } from './dota-api';
import type { DotaSourceKey } from '@alexeev/contracts';

const dotaIntelligenceKeys = {
  all: ['dota-intelligence'] as const,
  source: (source: string | undefined) => [...dotaIntelligenceKeys.all, source ?? 'all'] as const,
  detail: (sourceKey: DotaSourceKey, externalId: string) =>
    [...dotaIntelligenceKeys.all, 'detail', sourceKey, externalId] as const
};

export function dotaIntelligenceQueryOptions() {
  return queryOptions({
    queryKey: dotaIntelligenceKeys.source(undefined),
    queryFn: ({ signal }) => getDotaIntelligence(undefined, signal),
    staleTime: 30_000,
    retry: false
  });
}

export function dotaEventDetailQueryOptions(sourceKey: DotaSourceKey, externalId: string) {
  return queryOptions({
    queryKey: dotaIntelligenceKeys.detail(sourceKey, externalId),
    queryFn: ({ signal }) => getDotaEventDetail(sourceKey, externalId, signal),
    staleTime: 30_000,
    retry: false
  });
}
