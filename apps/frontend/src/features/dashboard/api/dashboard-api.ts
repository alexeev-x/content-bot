import { dashboardSchema, postPageSchema, publicationPageSchema } from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';
import { buildQuery } from '../../../shared/api/query-string';

export type DayRange = { from: string; to: string };

/** One request covers the week strip; the contract caps a page at 100 (a longer week shows a lower bound). */
export const WEEK_LIMIT = 100;
export const DRAFTS_LIMIT = 3;

export function getDashboard(range: DayRange, signal?: AbortSignal) {
  return apiRequest(`/api/v1/dashboard${buildQuery({ from: range.from, to: range.to })}`, dashboardSchema, { signal });
}

export function getWeekPublications(range: DayRange, signal?: AbortSignal) {
  const query = buildQuery({ from: range.from, to: range.to, order: 'asc', limit: WEEK_LIMIT });
  return apiRequest(`/api/v1/publications${query}`, publicationPageSchema, { signal });
}

export function getNewestDrafts(signal?: AbortSignal) {
  const query = buildQuery({ status: 'draft', limit: DRAFTS_LIMIT });
  return apiRequest(`/api/v1/posts${query}`, postPageSchema, { signal });
}
