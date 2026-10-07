import { dashboardSchema } from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';
import { buildQuery } from '../../../shared/api/query-string';

export type DayRange = { from: string; to: string };

export function getDashboard(range: DayRange, signal?: AbortSignal) {
  return apiRequest(`/api/v1/dashboard${buildQuery({ from: range.from, to: range.to })}`, dashboardSchema, { signal });
}
