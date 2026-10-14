import type { CSSProperties, ReactNode } from 'react';
import { ownerDayRange } from '../../../shared/lib/owner-timezone';
import { useNow } from '../../../shared/lib/use-now';
import { useMediaQuery, VisuallyHidden } from '../../../shared/ui';
import { PHONE_QUERY } from '../model/phone';
import { mediumSpan, type LayoutItem } from '../model/widget-catalog';
import { ActivityFeed } from './ActivityFeed';
import { Channels } from './Channels';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { DateChip } from './DateChip';
import { DayTimeline } from './DayTimeline';
import { Drafts } from './Drafts';
import { KpiTile } from './KpiTile';
import { NextUp } from './NextUp';
import { Preflight } from './Preflight';
import { RecentBubbles } from './RecentBubbles';
import { ScheduleGaps } from './ScheduleGaps';
import { SourceInbox } from './SourceInbox';
import { SystemLights } from './SystemLights';
import { WeekBars } from './WeekBars';
import type { WidgetEnv } from './widget-env';

type LayoutProps = {
  /** The owner's widgets in reading order. */
  items: readonly LayoutItem[];
  /** Everything the widgets need except the clock and the viewport, which the layout owns. */
  env: Omit<WidgetEnv, 'now' | 'phone'>;
  /** The `/dashboard` day is still loading: the root says so and its widgets draw skeletons. */
  loading: boolean;
  banner?: ReactNode;
  zoneNote: string;
};

export function renderWidget(item: LayoutItem, env: Omit<WidgetEnv, 'phone'>, phone: boolean): ReactNode {
  const { view, timezone, now } = env;
  const dashboard = view?.dashboard;
  switch (item.kind) {
    case 'today':
      return (
        <DayTimeline
          items={dashboard?.today}
          total={dashboard?.todayTotal ?? 0}
          day={ownerDayRange(now, timezone)}
          now={now}
          timezone={timezone}
          phone={phone}
          onOpenPublication={env.onOpenPublication}
          onNewPost={env.onNewPost}
          events={env.dayEvents}
          onOpenActivity={env.onOpenActivity}
        />
      );
    case 'upcoming':
      return (
        <NextUp
          today={dashboard?.today}
          upcoming={dashboard?.upcoming}
          now={now}
          timezone={timezone}
          onOpenPublication={env.onOpenPublication}
          onNewPost={env.onNewPost}
        />
      );
    case 'week':
      return <WeekBars query={env.week} now={now} timezone={timezone} onOpenDay={env.onOpenDay} />;
    case 'drafts':
      return <Drafts query={env.drafts} now={now} onPublish={env.onPublishDraft} onNewPost={env.onNewPost} />;
    case 'recent':
      return (
        <RecentBubbles
          items={dashboard?.recentSent}
          now={now}
          timezone={timezone}
          phone={phone}
          onOpenPublication={env.onOpenPublication}
        />
      );
    case 'system':
      return <SystemLights services={env.services} />;
    case 'schedule-gaps':
      return <ScheduleGaps now={now} timezone={timezone} onOpenDay={env.onOpenDay} onNewPost={env.onNewPost} />;
    case 'source-inbox':
      return <SourceInbox now={now} />;
    case 'preflight':
      return (
        <Preflight
          today={dashboard?.today}
          upcoming={dashboard?.upcoming}
          channels={env.channels}
          now={now}
          timezone={timezone}
          onOpenPublication={env.onOpenPublication}
        />
      );
    case 'activity':
      return <ActivityFeed timezone={timezone} now={now} onOpen={env.onOpenActivity} />;
    case 'channels':
      return <Channels channels={env.channels} />;
    case 'kpi-today':
    case 'kpi-sent':
    case 'kpi-attention':
    case 'kpi-next':
      return <KpiTile kind={item.kind} env={env} />;
  }
}

/** Grid placement of one widget: its span on a wide screen and the paired span on a medium one. */
export function cellStyle(item: LayoutItem): CSSProperties {
  return { '--w': item.w, '--w-mid': mediumSpan(item.w) } as CSSProperties;
}

/**
 * One layout for loading and loaded: the skeleton is this same tree without data, so nothing jumps when the
 * response arrives (docs/design/README.md §6). Widgets follow the owner's order on every screen.
 */
export function DashboardLayout({ items, env, loading, banner, zoneNote }: LayoutProps) {
  const phone = useMediaQuery(PHONE_QUERY);
  const now = useNow();
  const full = { ...env, now };
  return (
    <div className={styles.root} aria-busy={loading || undefined}>
      {loading ? (
        <VisuallyHidden>
          <output>{copy.loading}</output>
        </VisuallyHidden>
      ) : null}
      {banner}
      <DateChip placement="below" zoneNote={zoneNote} timezone={env.timezone} />
      {items.length === 0 ? (
        <p className={styles.quiet}>{copy.edit.empty}</p>
      ) : (
        <div className={styles.grid}>
          {items.map((item) => (
            <div key={item.id} className={styles.cell} style={cellStyle(item)}>
              {renderWidget(item, full, phone)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
