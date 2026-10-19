import {
  aiItemScriptSchema,
  aiVideoReviewResultSchema,
  contentAnalyticsOverviewSchema,
  contentGoalsSchema,
  contentItemDetailSchema,
  contentItemsPageSchema,
  contentReportDetailSchema,
  contentReportSchema,
  contentReportsPageSchema,
  tiktokConnectSchema,
  type ContentContaminationReason,
  type ContentPlatform,
  type ContentReportPeriod,
  type ContentVideoFormat
} from '@alexeev/contracts';
import { apiRequest, apiRequestNoContent } from '../../../shared/api/http-client';
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

/** The released daily and Monday reports, newest first. */
export function getContentReports(cursor: string | undefined, signal?: AbortSignal) {
  return apiRequest(`/api/v1/content-analytics/reports${buildQuery({ cursor })}`, contentReportsPageSchema, { signal });
}

/** One report: its text and, for a daily one, its forecasts with their scores. */
export function getContentReportDetail(id: string, signal?: AbortSignal) {
  return apiRequest(`/api/v1/content-analytics/reports/${encodeURIComponent(id)}`, contentReportDetailSchema, {
    signal
  });
}

export function getContentItem(id: string, signal?: AbortSignal) {
  return apiRequest(`/api/v1/content-analytics/items/${encodeURIComponent(id)}`, contentItemDetailSchema, { signal });
}

/** The owner's format mark for a video filmed without an AI script; null clears it. */
export function markItemFormat(itemId: string, format: ContentVideoFormat | null) {
  return apiRequestNoContent(`/api/v1/content-analytics/items/${encodeURIComponent(itemId)}/format`, {
    method: 'PUT',
    body: { format }
  });
}

/** The owner's confirmation of what distorted an item's numbers; null clears it. */
export function markItemContamination(itemId: string, reason: ContentContaminationReason | null) {
  return apiRequestNoContent(`/api/v1/content-analytics/items/${encodeURIComponent(itemId)}/contamination`, {
    method: 'PUT',
    body: { reason }
  });
}

const scriptPath = (itemId: string) => `/api/v1/ai/scripts/${encodeURIComponent(itemId)}`;

/** The approved AI script a video is linked to, or the candidates to confirm. */
export function getItemScript(itemId: string, signal?: AbortSignal) {
  return apiRequest(scriptPath(itemId), aiItemScriptSchema, { signal });
}

/** The 72 h review of a video; `review` is null while it is not due (or the item is not a video). */
export function getItemReview(itemId: string, signal?: AbortSignal) {
  return apiRequest(`/api/v1/ai/reviews/${encodeURIComponent(itemId)}`, aiVideoReviewResultSchema, { signal });
}

export function linkItemScript(itemId: string, revisionId: string) {
  return apiRequest(scriptPath(itemId), aiItemScriptSchema, { method: 'PUT', body: { revisionId } });
}

export function unlinkItemScript(itemId: string) {
  return apiRequest(scriptPath(itemId), aiItemScriptSchema, { method: 'DELETE' });
}

export function getContentReport(days: ContentReportPeriod, signal?: AbortSignal) {
  return apiRequest(`/api/v1/content-analytics/report${buildQuery({ days })}`, contentReportSchema, { signal });
}

/** Starts the TikTok sign-in: the browser then goes to the returned TikTok consent page. */
export function connectTikTok() {
  return apiRequest('/api/v1/content-analytics/tiktok/connect', tiktokConnectSchema, { method: 'POST' });
}

export function getContentGoals(signal?: AbortSignal) {
  return apiRequest('/api/v1/content-analytics/goals', contentGoalsSchema, { signal });
}

export function setContentGoal(platform: ContentPlatform, target: number) {
  return apiRequest(`/api/v1/content-analytics/goals/${platform}`, contentGoalsSchema, {
    method: 'PUT',
    body: { target }
  });
}

export function removeContentGoal(platform: ContentPlatform) {
  return apiRequest(`/api/v1/content-analytics/goals/${platform}`, contentGoalsSchema, { method: 'DELETE' });
}

export function disconnectTikTok() {
  return apiRequestNoContent('/api/v1/content-analytics/tiktok/disconnect', { method: 'POST' });
}
