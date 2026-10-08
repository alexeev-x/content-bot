import { queryOptions } from '@tanstack/react-query';
import { fetchChannels, fetchDrafts, fetchIncidents, fetchWeek, INCIDENTS_CLOSED_LIMIT } from './widget-api';

// The widgets that are not fed by `/dashboard` read the existing list endpoints, one bounded page each. A widget
// that is not in the layout never mounts, so none of these requests happens for it.
const STALE_MS = 30_000;

export const widgetKeys = {
  all: ['dashboard-widgets'] as const,
  drafts: () => [...widgetKeys.all, 'drafts'] as const,
  week: (from: string) => [...widgetKeys.all, 'week', from] as const,
  channels: () => [...widgetKeys.all, 'channels'] as const,
  incidents: (state: 'open' | 'resolved') => [...widgetKeys.all, 'incidents', state] as const
};

export const draftsQueryOptions = () =>
  queryOptions({ queryKey: widgetKeys.drafts(), queryFn: ({ signal }) => fetchDrafts(signal), staleTime: STALE_MS });

/** `range.from` keys the query, so a new local day asks again. */
export const weekQueryOptions = (range: { from: string; to: string }) =>
  queryOptions({
    queryKey: widgetKeys.week(range.from),
    queryFn: ({ signal }) => fetchWeek(range, signal),
    staleTime: STALE_MS
  });

export const channelsQueryOptions = () =>
  queryOptions({
    queryKey: widgetKeys.channels(),
    queryFn: ({ signal }) => fetchChannels(signal),
    staleTime: STALE_MS
  });

/** The newest open incident and the open count (a one-row page carries both). */
export const openIncidentsQueryOptions = () =>
  queryOptions({
    queryKey: widgetKeys.incidents('open'),
    queryFn: ({ signal }) => fetchIncidents('open', 1, signal),
    staleTime: STALE_MS
  });

/** The most recently closed incidents, at most one page: enough to count the last 7 days up to a bound. */
export const closedIncidentsQueryOptions = () =>
  queryOptions({
    queryKey: widgetKeys.incidents('resolved'),
    queryFn: ({ signal }) => fetchIncidents('resolved', INCIDENTS_CLOSED_LIMIT, signal),
    staleTime: STALE_MS
  });
