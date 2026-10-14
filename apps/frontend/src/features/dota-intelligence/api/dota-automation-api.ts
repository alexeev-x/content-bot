import {
  automationListSchema,
  automationMutationSchema,
  runAutomationNowResponseSchema,
  type AutomationId
} from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';

export function listAutomations(signal?: AbortSignal) {
  return apiRequest('/api/v1/automations', automationListSchema, { signal });
}

export function runAutomationNow(id: AutomationId, idempotencyKey: string) {
  return apiRequest(`/api/v1/automations/${id}/run-now`, runAutomationNowResponseSchema, {
    method: 'POST',
    body: {},
    headers: { 'Idempotency-Key': idempotencyKey }
  });
}

export function setAutomationPaused(id: AutomationId, paused: boolean, revision: number, idempotencyKey: string) {
  return apiRequest(`/api/v1/automations/${id}/${paused ? 'pause' : 'resume'}`, automationMutationSchema, {
    method: 'POST',
    body: { revision },
    headers: { 'Idempotency-Key': idempotencyKey }
  });
}
