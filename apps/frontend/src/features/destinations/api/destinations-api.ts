import {
  destinationCheckSchema,
  destinationPageSchema,
  destinationSchema,
  type checkDestinationInputSchema,
  type createDestinationInputSchema,
  type updateDestinationInputSchema
} from '@alexeev/contracts';
import type { z } from 'zod';
import { apiRequest } from '../../../shared/api/http-client';
import { buildQuery, DEFAULT_PAGE_SIZE } from '../../../shared/api/query-string';

export type DestinationFilters = { enabled?: boolean | undefined };
export type CheckDestinationBody = z.input<typeof checkDestinationInputSchema>;
export type CreateDestinationBody = z.input<typeof createDestinationInputSchema>;
export type UpdateDestinationBody = z.input<typeof updateDestinationInputSchema>;

export function listDestinations(filters: DestinationFilters, cursor: string | undefined, signal?: AbortSignal) {
  const query = buildQuery({
    enabled: filters.enabled === undefined ? undefined : String(filters.enabled),
    cursor,
    limit: DEFAULT_PAGE_SIZE
  });
  return apiRequest(`/api/v1/destinations${query}`, destinationPageSchema, { signal });
}

export function getDestination(id: string, signal?: AbortSignal) {
  return apiRequest(`/api/v1/destinations/${encodeURIComponent(id)}`, destinationSchema, { signal });
}

export function createDestination(input: CreateDestinationBody, idempotencyKey: string) {
  return apiRequest('/api/v1/destinations', destinationSchema, {
    method: 'POST',
    body: input,
    headers: { 'Idempotency-Key': idempotencyKey }
  });
}

export function updateDestination(id: string, input: UpdateDestinationBody) {
  return apiRequest(`/api/v1/destinations/${encodeURIComponent(id)}`, destinationSchema, {
    method: 'PATCH',
    body: input
  });
}

/** Asks Telegram about a chat before it is saved. Stores nothing, so repeating it is safe (but rate limited). */
export function checkDestination(input: CheckDestinationBody, signal?: AbortSignal) {
  return apiRequest('/api/v1/destinations/check', destinationCheckSchema, { method: 'POST', body: input, signal });
}
