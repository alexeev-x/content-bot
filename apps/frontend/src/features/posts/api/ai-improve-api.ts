import { type AiImproveInput, aiImproveResultSchema } from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';

/** One paid suggestion for a fragment of the post; saves nothing (docs/API_CONTRACTS.md § AI). */
export function improvePostText(input: AiImproveInput, signal?: AbortSignal) {
  return apiRequest('/api/v1/ai/improve', aiImproveResultSchema, { method: 'POST', body: input, signal });
}
