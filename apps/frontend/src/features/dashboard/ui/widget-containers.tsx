import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { INCIDENTS_CLOSED_LIMIT, WEEK_LIMIT } from '../api/widget-api';
import {
  channelsQueryOptions,
  closedIncidentsQueryOptions,
  draftsQueryOptions,
  openIncidentsQueryOptions,
  weekQueryOptions
} from '../api/widget-queries';
import type { ServiceRow } from '../model/service-rows';
import { weekDays, weekRange } from '../model/week';
import { ChannelsPanel } from './ChannelsPanel';
import { DraftsPanel } from './DraftsPanel';
import { IncidentsPanel, type IncidentSummary } from './IncidentsPanel';
import { WeekPanel } from './WeekPanel';

type DraftsProps = {
  narrow: boolean;
  capacity: number;
  onContinue: (postId: string) => void;
  onNewPost: () => void;
};

/** Reads the first page of drafts; mounted only when the layout has the widget. */
export function DraftsWidget(props: DraftsProps) {
  const query = useQuery(draftsQueryOptions());
  return (
    <DraftsPanel
      {...props}
      items={query.data?.items}
      failed={query.isError && !query.data}
      onRetry={() => void query.refetch()}
    />
  );
}

export function WeekWidget({ now, timezone }: { now: Date; timezone: string }) {
  const range = weekRange(now, timezone);
  const query = useQuery(weekQueryOptions(range));
  const days = useMemo(
    () => (query.data ? weekDays(query.data.items, now, timezone) : undefined),
    [query.data, now, timezone]
  );
  const truncated = query.data?.nextCursor != null && query.data.items.length >= WEEK_LIMIT;
  return (
    <WeekPanel
      days={days}
      timezone={timezone}
      failed={query.isError && !query.data}
      onRetry={() => void query.refetch()}
      truncated={truncated}
      limit={WEEK_LIMIT}
    />
  );
}

type ChannelsProps = { bot: ServiceRow | undefined; capacity: number; onAddChannel: () => void };

export function ChannelsWidget(props: ChannelsProps) {
  const query = useQuery(channelsQueryOptions());
  return (
    <ChannelsPanel
      {...props}
      channels={query.data?.items}
      failed={query.isError && !query.data}
      onRetry={() => void query.refetch()}
    />
  );
}

const DAY_MS = 24 * 3_600_000;

export function IncidentsWidget({ now }: { now: Date }) {
  const open = useQuery(openIncidentsQueryOptions());
  const closed = useQuery(closedIncidentsQueryOptions());
  const summary = useMemo<IncidentSummary | undefined>(() => {
    if (!open.data || !closed.data) return undefined;
    const since = now.getTime() - 7 * DAY_MS;
    const recent = closed.data.items.filter((item) => Date.parse(item.resolvedAt ?? '') >= since);
    return {
      open: open.data.openCount,
      closed: recent.length,
      // A full page of closed incidents that are all recent: older ones may still be inside the 7 days.
      closedCapped: closed.data.items.length >= INCIDENTS_CLOSED_LIMIT && recent.length === closed.data.items.length,
      latest: open.data.items[0] ?? closed.data.items[0]
    };
  }, [open.data, closed.data, now]);
  const failed = (open.isError && !open.data) || (closed.isError && !closed.data);
  return (
    <IncidentsPanel
      summary={summary}
      failed={failed}
      onRetry={() => {
        void open.refetch();
        void closed.refetch();
      }}
    />
  );
}
