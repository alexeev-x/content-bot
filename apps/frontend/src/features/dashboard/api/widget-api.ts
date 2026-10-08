import {
  destinationPageSchema,
  incidentPageSchema,
  postPageSchema,
  publicationPageSchema,
  type IncidentState
} from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';
import { buildQuery } from '../../../shared/api/query-string';

export const DRAFTS_LIMIT = 5;
export const WEEK_LIMIT = 100;
export const CHANNELS_LIMIT = 20;
export const INCIDENTS_CLOSED_LIMIT = 50;

/** Recently edited drafts: the first page of the posts list, drafts only, newest update first. */
export function fetchDrafts(signal?: AbortSignal) {
  return apiRequest(`/api/v1/posts${buildQuery({ status: 'draft', limit: DRAFTS_LIMIT })}`, postPageSchema, { signal });
}

/** Scheduled publications from `from` (inclusive) to `to` (exclusive), earliest first; one bounded page. */
export function fetchWeek(range: { from: string; to: string }, signal?: AbortSignal) {
  const query = buildQuery({
    status: 'scheduled',
    from: range.from,
    to: range.to,
    order: 'asc',
    limit: WEEK_LIMIT
  });
  return apiRequest(`/api/v1/publications${query}`, publicationPageSchema, { signal });
}

export function fetchChannels(signal?: AbortSignal) {
  return apiRequest(`/api/v1/destinations${buildQuery({ limit: CHANNELS_LIMIT })}`, destinationPageSchema, { signal });
}

export function fetchIncidents(state: IncidentState, limit: number, signal?: AbortSignal) {
  return apiRequest(`/api/v1/incidents${buildQuery({ state, limit })}`, incidentPageSchema, { signal });
}
