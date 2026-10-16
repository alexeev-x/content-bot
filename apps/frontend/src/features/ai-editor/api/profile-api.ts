import { aiAuthorProfileSchema, type UpdateAiAuthorProfileInput } from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';

export function getAuthorProfile(signal?: AbortSignal) {
  return apiRequest('/api/v1/ai/profile', aiAuthorProfileSchema, { signal });
}

export function saveAuthorProfile(input: UpdateAiAuthorProfileInput) {
  return apiRequest('/api/v1/ai/profile', aiAuthorProfileSchema, { method: 'PUT', body: input });
}

/** Reads rank and heroes from OpenDota now. */
export function syncAuthorDota() {
  return apiRequest('/api/v1/ai/profile/dota', aiAuthorProfileSchema, { method: 'POST' });
}
