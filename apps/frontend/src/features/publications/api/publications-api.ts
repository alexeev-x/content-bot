import {
  publicationPageSchema,
  publicationSchema,
  type cancelPublicationInputSchema,
  type createPublicationInputSchema,
  type listPublicationsQuerySchema,
  type reschedulePublicationInputSchema,
  type resolveUnknownPublicationInputSchema
} from '@alexeev/contracts';
import type { z } from 'zod';
import { apiRequest } from '../../../shared/api/http-client';
import { buildQuery, DEFAULT_PAGE_SIZE } from '../../../shared/api/query-string';

export type PublicationFilters = Pick<
  z.input<typeof listPublicationsQuerySchema>,
  'status' | 'postId' | 'destinationId' | 'q' | 'from' | 'to' | 'order'
>;
export type CreatePublicationBody = z.input<typeof createPublicationInputSchema>;
export type ReschedulePublicationBody = z.input<typeof reschedulePublicationInputSchema>;
export type CancelPublicationBody = z.input<typeof cancelPublicationInputSchema>;
export type ResolveUnknownBody = z.input<typeof resolveUnknownPublicationInputSchema>;

export function listPublications(filters: PublicationFilters, cursor: string | undefined, signal?: AbortSignal) {
  const query = buildQuery({
    status: filters.status,
    postId: filters.postId,
    destinationId: filters.destinationId,
    q: filters.q,
    from: filters.from,
    to: filters.to,
    order: filters.order,
    cursor,
    limit: DEFAULT_PAGE_SIZE
  });
  return apiRequest(`/api/v1/publications${query}`, publicationPageSchema, { signal });
}

export function getPublication(id: string, signal?: AbortSignal) {
  return apiRequest(`/api/v1/publications/${encodeURIComponent(id)}`, publicationSchema, { signal });
}

/** 202 means accepted for scheduling, not sent: callers show the returned status. */
export function createPublication(input: CreatePublicationBody, idempotencyKey: string) {
  return apiRequest('/api/v1/publications', publicationSchema, {
    method: 'POST',
    body: input,
    headers: { 'Idempotency-Key': idempotencyKey }
  });
}

export function reschedulePublication(id: string, input: ReschedulePublicationBody) {
  return apiRequest(`/api/v1/publications/${encodeURIComponent(id)}/reschedule`, publicationSchema, {
    method: 'POST',
    body: input
  });
}

export function cancelPublication(id: string, input: CancelPublicationBody) {
  return apiRequest(`/api/v1/publications/${encodeURIComponent(id)}/cancel`, publicationSchema, {
    method: 'POST',
    body: input
  });
}

/** Manual reconciliation of an `unknown` send; the owner checked the channel first. Never retried automatically. */
export function resolveUnknownPublication(id: string, input: ResolveUnknownBody) {
  return apiRequest(`/api/v1/publications/${encodeURIComponent(id)}/resolve-unknown`, publicationSchema, {
    method: 'POST',
    body: input
  });
}
