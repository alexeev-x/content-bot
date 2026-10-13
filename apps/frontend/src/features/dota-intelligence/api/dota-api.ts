import { dotaEventDetailSchema, dotaIntelligenceSchema, type DotaSourceKey } from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';
import { buildQuery } from '../../../shared/api/query-string';

export function getDotaIntelligence(source?: DotaSourceKey, signal?: AbortSignal) {
  return apiRequest(`/api/v1/dota${buildQuery({ source, limit: 100 })}`, dotaIntelligenceSchema, { signal });
}

export function getDotaEventDetail(sourceKey: DotaSourceKey, externalId: string, signal?: AbortSignal) {
  return apiRequest(`/api/v1/dota/updates/${sourceKey}/${encodeURIComponent(externalId)}`, dotaEventDetailSchema, {
    signal
  });
}
