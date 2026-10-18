import {
  aiFeedbackListSchema,
  aiLearningItemSchema,
  aiLearningListSchema,
  aiOverviewSchema,
  aiUnlinkedScriptsSchema,
  type AiLearningSource,
  type UpdateAiSettingsInput
} from '@alexeev/contracts';
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

/** The owner's texts the writer takes as examples, newest first. */
export function getAiLearning(signal?: AbortSignal) {
  return apiRequest('/api/v1/ai/learning', aiLearningListSchema, { signal });
}

/** «Учитывать» off/on for one text; repeating it is a no-op on the server. */
export function setAiLearningExcluded(input: { source: AiLearningSource; id: string; excluded: boolean }) {
  return apiRequest(`/api/v1/ai/learning/${input.source}/${encodeURIComponent(input.id)}`, aiLearningItemSchema, {
    method: 'PUT',
    body: { excluded: input.excluded }
  });
}

/** Approved Reels scripts of the last 60 days that no video is linked to, newest first. */
export function getAiUnlinkedScripts(signal?: AbortSignal) {
  return apiRequest('/api/v1/ai/scripts/unlinked', aiUnlinkedScriptsSchema, { signal });
}
