import { activityPageSchema, type ActivityCategory } from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';
import { buildQuery } from '../../../shared/api/query-string';

export type ActivityFilters = { category?: ActivityCategory; from?: string; to?: string; limit?: number };

export function getActivity(filters: ActivityFilters, cursor: string | undefined, signal?: AbortSignal) {
  return apiRequest(`/api/v1/activity${buildQuery({ ...filters, cursor })}`, activityPageSchema, { signal });
}
