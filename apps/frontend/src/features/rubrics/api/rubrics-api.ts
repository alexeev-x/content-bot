import { rubricForecastSchema, rubricSchedulerStatusSchema } from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';

export function getRubricSchedulerStatus(signal?: AbortSignal) {
  return apiRequest('/api/v1/rubrics/status', rubricSchedulerStatusSchema, { signal });
}

/** The 35-day forecast; computed per request on the server, cached there for 5 minutes. */
export function getRubricForecast(signal?: AbortSignal) {
  return apiRequest('/api/v1/rubrics/forecast', rubricForecastSchema, { signal });
}
