import { destinationPageSchema } from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';

/** Enabled destinations for the channel select; at most 100 (the page limit), which is far above a personal bot's needs. */
export function listEnabledDestinations(signal?: AbortSignal) {
  return apiRequest('/api/v1/destinations?enabled=true&limit=100', destinationPageSchema, { signal });
}
