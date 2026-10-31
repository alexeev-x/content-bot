import {
  publicationHistorySchema,
  publicationPageSchema,
  publicationSchema,
  publicationSeriesSchema,
  type createPublicationSeriesInputSchema,
  bulkDeletePublicationsInputSchema,
  bulkDeletePublicationsResultSchema,
  deletePublicationInputSchema,
  deletePublicationResultSchema,
  type cancelPublicationInputSchema,
  type createPublicationInputSchema,
  type listPublicationsQuerySchema,
  type reschedulePublicationInputSchema,
  type resolveUnknownPublicationInputSchema
} from '@alexeev/contracts';
import type { z } from 'zod';
import { apiRequest } from '../../../shared/api/http-client';
import { PAGE_SIZE } from '../../../shared/api/page-query';
import { buildQuery, DEFAULT_PAGE_SIZE } from '../../../shared/api/query-string';

export type PublicationFilters = Pick<
  z.input<typeof listPublicationsQuerySchema>,
  'status' | 'statusGroup' | 'kind' | 'postId' | 'destinationId' | 'q' | 'from' | 'to' | 'order'
>;
export type CreatePublicationBody = z.input<typeof createPublicationInputSchema>;
export type CreatePublicationSeriesBody = z.input<typeof createPublicationSeriesInputSchema>;
export type ReschedulePublicationBody = z.input<typeof reschedulePublicationInputSchema>;
export type CancelPublicationBody = z.input<typeof cancelPublicationInputSchema>;
export type ResolveUnknownBody = z.input<typeof resolveUnknownPublicationInputSchema>;
export type DeletePublicationBody = z.input<typeof deletePublicationInputSchema>;
export type BulkDeletePublicationsBody = z.input<typeof bulkDeletePublicationsInputSchema>;

export function listPublications(
  filters: PublicationFilters,
  cursor: string | undefined,
  signal?: AbortSignal,
  page?: number
) {
  const query = buildQuery({
    status: filters.status,
    statusGroup: filters.statusGroup,
    kind: filters.kind,
    postId: filters.postId,
    destinationId: filters.destinationId,
    q: filters.q,
    from: filters.from,
    to: filters.to,
    order: filters.order,
    cursor,
    page,
    limit: page === undefined ? DEFAULT_PAGE_SIZE : PAGE_SIZE
  });
  return apiRequest(`/api/v1/publications${query}`, publicationPageSchema, { signal });
}

export function getPublication(id: string, signal?: AbortSignal) {
  return apiRequest(`/api/v1/publications/${encodeURIComponent(id)}`, publicationSchema, { signal });
}

/** Owner actions and send attempts, oldest first. */
export function getPublicationHistory(id: string, signal?: AbortSignal) {
  return apiRequest(`/api/v1/publications/${encodeURIComponent(id)}/history`, publicationHistorySchema, { signal });
}

/** 202 means accepted for scheduling, not sent: callers show the returned status. */
export function createPublication(input: CreatePublicationBody, idempotencyKey: string) {
  return apiRequest('/api/v1/publications', publicationSchema, {
    method: 'POST',
    body: input,
    headers: { 'Idempotency-Key': idempotencyKey }
  });
}

/** Posts of one event in order with a gap (owner, 22.10.2026); 202 is not a claim that anything was sent. */
export function createPublicationSeries(input: CreatePublicationSeriesBody, idempotencyKey: string) {
  return apiRequest('/api/v1/publications/series', publicationSeriesSchema, {
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

export function deletePublication(id: string, input: DeletePublicationBody) {
  return apiRequest(`/api/v1/publications/${encodeURIComponent(id)}/delete`, deletePublicationResultSchema, {
    method: 'POST',
    body: input
  });
}

export function deletePublications(input: BulkDeletePublicationsBody) {
  return apiRequest('/api/v1/publications/delete', bulkDeletePublicationsResultSchema, {
    method: 'POST',
    body: input
  });
}
