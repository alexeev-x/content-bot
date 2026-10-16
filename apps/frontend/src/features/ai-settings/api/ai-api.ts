import { aiOverviewSchema, type UpdateAiSettingsInput } from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';

export function getAiOverview(signal?: AbortSignal) {
  return apiRequest('/api/v1/ai', aiOverviewSchema, { signal });
}

export function saveAiSettings(input: UpdateAiSettingsInput) {
  return apiRequest('/api/v1/ai/settings', aiOverviewSchema, { method: 'PUT', body: input });
}

/** One tiny request to the model: shows whether the key and the model work. */
export function checkAiConnection() {
  return apiRequest('/api/v1/ai/check', aiOverviewSchema, { method: 'POST' });
}
