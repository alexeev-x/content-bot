import { aiFeedbackListSchema, aiOverviewSchema, type UpdateAiSettingsInput } from '@alexeev/contracts';
import { apiRequest, apiRequestNoContent } from '../../../shared/api/http-client';

/** The owner's recorded verdicts on drafts, newest first. */
export function getAiFeedback(signal?: AbortSignal) {
  return apiRequest('/api/v1/ai/feedback', aiFeedbackListSchema, { signal });
}

/** Takes a verdict back; one already gone answers 204 too. */
export function deleteAiFeedback(id: string) {
  return apiRequestNoContent(`/api/v1/ai/feedback/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

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
