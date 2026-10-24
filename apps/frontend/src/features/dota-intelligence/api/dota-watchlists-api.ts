import { addDotaWatchlistResponseSchema, dotaWatchlistsSchema, type AddDotaWatchlistInput } from '@alexeev/contracts';
import { apiRequest, apiRequestNoContent } from '../../../shared/api/http-client';

export function getDotaWatchlists(signal?: AbortSignal) {
  return apiRequest('/api/v1/dota/watchlists', dotaWatchlistsSchema, { signal });
}

export function addDotaWatchlist(input: AddDotaWatchlistInput, idempotencyKey: string) {
  return apiRequest('/api/v1/dota/watchlists', addDotaWatchlistResponseSchema, {
    method: 'POST',
    body: input,
    headers: { 'Idempotency-Key': idempotencyKey }
  });
}

export function removeDotaWatchlist(watchId: string) {
  return apiRequestNoContent(`/api/v1/dota/watchlists/${encodeURIComponent(watchId)}`, { method: 'DELETE' });
}
