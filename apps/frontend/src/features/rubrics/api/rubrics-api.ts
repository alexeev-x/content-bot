import {
  destinationPageSchema,
  rubricCalendarSchema,
  rubricForecastSchema,
  rubricItemSchema,
  rubricListSchema,
  rubricSchedulerStatusSchema,
  rubricSlotDetailSchema,
  type RubricKey,
  type UpdateRubricInput,
  type UpdateRubricSchedulerInput
} from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';

export function getRubricSchedulerStatus(signal?: AbortSignal) {
  return apiRequest('/api/v1/rubrics/status', rubricSchedulerStatusSchema, { signal });
}

/** The 35-day forecast; computed per request on the server, cached there for 5 minutes. */
export function getRubricForecast(signal?: AbortSignal) {
  return apiRequest('/api/v1/rubrics/forecast', rubricForecastSchema, { signal });
}

/** The real slots of Moscow days `from`–`to` (at most 42). */
export function getRubricCalendar(from: string, to: string, signal?: AbortSignal) {
  return apiRequest(`/api/v1/rubrics/calendar?from=${from}&to=${to}`, rubricCalendarSchema, { signal });
}

export function getRubricList(signal?: AbortSignal) {
  return apiRequest('/api/v1/rubrics', rubricListSchema, { signal });
}

export function getRubricSlot(id: string, signal?: AbortSignal) {
  return apiRequest(`/api/v1/rubrics/slots/${id}`, rubricSlotDetailSchema, { signal });
}

export function updateRubricScheduler(input: UpdateRubricSchedulerInput) {
  return apiRequest('/api/v1/rubrics/scheduler', rubricSchedulerStatusSchema, { method: 'PUT', body: input });
}

export function updateRubric(key: RubricKey, input: UpdateRubricInput) {
  return apiRequest(`/api/v1/rubrics/${key}`, rubricItemSchema, { method: 'PATCH', body: input });
}

export function skipRubricSlot(id: string) {
  return apiRequest(`/api/v1/rubrics/slots/${id}/skip`, rubricSlotDetailSchema, { method: 'POST', body: {} });
}

/** The channels the rubrics may go to; own fetcher so this feature never imports the destinations feature. */
export function listRubricChannels(signal?: AbortSignal) {
  return apiRequest('/api/v1/destinations?enabled=true&limit=100', destinationPageSchema, { signal });
}
