import { dashboardLayoutSchema, type UpdateDashboardLayoutInput } from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';

const PATH = '/api/v1/settings/dashboard-layout';

export function fetchDashboardLayout(signal?: AbortSignal) {
  return apiRequest(PATH, dashboardLayoutSchema, { signal });
}

/** Replaces the whole layout; `revision` is the one the edits are based on (409 STALE_REVISION otherwise). */
export function saveDashboardLayout(input: UpdateDashboardLayoutInput) {
  return apiRequest(PATH, dashboardLayoutSchema, { method: 'PUT', body: input });
}
