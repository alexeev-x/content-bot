import { dotaHeroStatisticsSchema } from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';

export function getDotaHeroStatistics(signal?: AbortSignal) {
  return apiRequest('/api/v1/dota/hero-statistics', dotaHeroStatisticsSchema, { signal });
}
