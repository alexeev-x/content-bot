import { automationListSchema, automationMutationSchema, runAutomationNowResponseSchema } from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';

const WATCHER_ID = 'dota-intelligence';

export function listAutomations(signal?: AbortSignal) {
  return apiRequest('/api/v1/automations', automationListSchema, { signal });
}

export function runWatcherNow(idempotencyKey: string) {
  return apiRequest(`/api/v1/automations/${WATCHER_ID}/run-now`, runAutomationNowResponseSchema, {
    method: 'POST',
    body: {},
    headers: { 'Idempotency-Key': idempotencyKey }
  });
}

export function setWatcherPaused(paused: boolean, revision: number, idempotencyKey: string) {
  return apiRequest(`/api/v1/automations/${WATCHER_ID}/${paused ? 'pause' : 'resume'}`, automationMutationSchema, {
    method: 'POST',
    body: { revision },
    headers: { 'Idempotency-Key': idempotencyKey }
  });
}
