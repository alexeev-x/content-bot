import {
  aiItemScriptSchema,
  contentAnalyticsOverviewSchema,
  contentGoalsSchema,
  contentItemDetailSchema,
  contentItemsPageSchema,
  contentReportSchema,
  tiktokConnectSchema,
  type ContentPlatform,
  type ContentReportPeriod
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

export function getContentItem(id: string, signal?: AbortSignal) {
  return apiRequest(`/api/v1/content-analytics/items/${encodeURIComponent(id)}`, contentItemDetailSchema, { signal });
}

const scriptPath = (itemId: string) => `/api/v1/ai/scripts/${encodeURIComponent(itemId)}`;

/** The approved AI script a video is linked to, or the candidates to confirm. */
export function getItemScript(itemId: string, signal?: AbortSignal) {
  return apiRequest(scriptPath(itemId), aiItemScriptSchema, { signal });
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
