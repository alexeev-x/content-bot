import {
  contentAnalyticsOverviewSchema,
  contentItemDetailSchema,
  contentItemsPageSchema,
  contentReportSchema,
  type ContentPlatform,
  type ContentReportPeriod
} from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';
import { buildQuery } from '../../../shared/api/query-string';

export const ITEMS_PAGE_SIZE = 20;

export function getContentOverview(signal?: AbortSignal) {
  return apiRequest('/api/v1/content-analytics', contentAnalyticsOverviewSchema, { signal });
}

/** Collects every source not collected in the last 5 minutes, then returns the fresh overview. */
export function syncContent() {
  return apiRequest('/api/v1/content-analytics/sync', contentAnalyticsOverviewSchema, { method: 'POST' });
}

export function getContentItems(
  platform: ContentPlatform | undefined,
  cursor: string | undefined,
  signal?: AbortSignal
) {
  const query = buildQuery({ platform, cursor, limit: ITEMS_PAGE_SIZE });
  return apiRequest(`/api/v1/content-analytics/items${query}`, contentItemsPageSchema, { signal });
}

export function getContentItem(id: string, signal?: AbortSignal) {
  return apiRequest(`/api/v1/content-analytics/items/${encodeURIComponent(id)}`, contentItemDetailSchema, { signal });
}

export function getContentReport(days: ContentReportPeriod, signal?: AbortSignal) {
  return apiRequest(`/api/v1/content-analytics/report${buildQuery({ days })}`, contentReportSchema, { signal });
}
