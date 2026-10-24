import { incidentPageSchema, incidentSchema, INCIDENT_PAGE_LIMIT_DEFAULT } from '@alexeev/contracts';
import type { IncidentKind, IncidentState } from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';
import { buildQuery } from '../../../shared/api/query-string';

export type IncidentFilters = { state: IncidentState; kind?: IncidentKind | undefined };

export function listIncidents(
  filters: IncidentFilters,
  cursor: string | undefined,
  signal?: AbortSignal,
  limit: number = INCIDENT_PAGE_LIMIT_DEFAULT
) {
  const query = buildQuery({ state: filters.state, kind: filters.kind, cursor, limit });
  return apiRequest(`/api/v1/incidents${query}`, incidentPageSchema, { signal });
}

/** Acknowledges a `publish_failed` incident. Naturally idempotent, so a retry after a failure is safe. */
export function resolveIncident(id: string) {
  return apiRequest(`/api/v1/incidents/${encodeURIComponent(id)}/resolve`, incidentSchema, { method: 'POST' });
}
