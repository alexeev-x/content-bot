import { publicationAnalyticsReportSchema, type PublicationAnalyticsQuery } from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';
import { buildQuery } from '../../../shared/api/query-string';

const PATH = '/api/v1/analytics/publications';

export function fetchPublicationAnalytics(query: PublicationAnalyticsQuery, signal?: AbortSignal) {
  return apiRequest(`${PATH}${buildQuery(query)}`, publicationAnalyticsReportSchema, { signal });
}
