import {
  createSourceEventDraftResponseSchema,
  sourceEventPageSchema,
  sourceEventSchema,
  type SourceEventStatus,
  type SourceEventType
} from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';
import { buildQuery } from '../../../shared/api/query-string';

export type SourceEventsFilters = { status?: SourceEventStatus; type?: SourceEventType; page: number; limit: number };

export function getSourceEvents(filters: SourceEventsFilters, signal?: AbortSignal) {
  return apiRequest(`/api/v1/sources/events${buildQuery(filters)}`, sourceEventPageSchema, { signal });
}

const eventPath = (id: string) => `/api/v1/sources/events/${encodeURIComponent(id)}`;

export function createSourceEventDraft(id: string) {
  return apiRequest(`${eventPath(id)}/draft`, createSourceEventDraftResponseSchema, { method: 'POST', body: {} });
}

export function setSourceEventHidden(id: string, hidden: boolean) {
  return apiRequest(`${eventPath(id)}/${hidden ? 'hide' : 'unhide'}`, sourceEventSchema, { method: 'POST', body: {} });
}
