import {
  approveSourceEventAiDraftResponseSchema,
  createSourceEventDraftResponseSchema,
  sourceEventAiDraftSchema,
  sourceEventContentSchema,
  sourceEventPageSchema,
  sourceEventSchema,
  type SourceEventType,
  type SourceEventView
} from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';
import { buildQuery } from '../../../shared/api/query-string';

export type SourceEventsFilters = { view?: SourceEventView; type?: SourceEventType; page: number; limit: number };

export function getSourceEvents(filters: SourceEventsFilters, signal?: AbortSignal) {
  return apiRequest(`/api/v1/sources/events${buildQuery(filters)}`, sourceEventPageSchema, { signal });
}

const eventPath = (id: string) => `/api/v1/sources/events/${encodeURIComponent(id)}`;

/** The announcement itself (text, images, dota2.com link), read from Steam by the server. */
export function getSourceEventContent(id: string, signal?: AbortSignal) {
  return apiRequest(`${eventPath(id)}/content`, sourceEventContentSchema, { signal });
}

export function createSourceEventDraft(id: string) {
  return apiRequest(`${eventPath(id)}/draft`, createSourceEventDraftResponseSchema, { method: 'POST', body: {} });
}

/** Asks the AI writer for a post; the draft arrives in the bot for approval. Each call is a paid model call. */
export function requestSourceEventAiDraft(id: string) {
  return apiRequest(`${eventPath(id)}/ai-draft`, sourceEventSchema, { method: 'POST', body: {} });
}

/** The newest version of the event's AI draft (the bot's draft, readable here). */
export function getSourceEventAiDraft(id: string, signal?: AbortSignal) {
  return apiRequest(`${eventPath(id)}/ai-draft`, sourceEventAiDraftSchema, { signal });
}

/** Approves exactly the version shown: it becomes a studio post, linked to the event, with its images. */
export function approveSourceEventAiDraft(id: string, versionId: string) {
  return apiRequest(`${eventPath(id)}/ai-draft/approve`, approveSourceEventAiDraftResponseSchema, {
    method: 'POST',
    body: { versionId }
  });
}

export function setSourceEventHidden(id: string, hidden: boolean) {
  return apiRequest(`${eventPath(id)}/${hidden ? 'hide' : 'unhide'}`, sourceEventSchema, { method: 'POST', body: {} });
}
