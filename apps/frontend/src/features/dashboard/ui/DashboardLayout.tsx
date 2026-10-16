import type { CSSProperties, ReactNode } from 'react';
import { ownerDayRange } from '../../../shared/lib/owner-timezone';
import { useNow } from '../../../shared/lib/use-now';
import { useMediaQuery, VisuallyHidden } from '../../../shared/ui';
import { PHONE_QUERY } from '../model/phone';
import { LAYOUT, type LayoutItem } from '../model/layout';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { DateChip } from './DateChip';
import { DayTimeline } from './DayTimeline';
import { AnalyticsWidget } from './AnalyticsWidget';
import { NextUp } from './NextUp';
import { SourcesWidget } from './SourcesWidget';
import { WeekBars } from './WeekBars';
import { Widget } from './Widget';
import type { WidgetEnv } from './widget-env';

type LayoutProps = {
  /** Everything the widgets need except the clock and the viewport, which the layout owns. */
  env: Omit<WidgetEnv, 'now' | 'phone'>;
  /** The `/dashboard` day is still loading: the root says so and its widgets draw skeletons. */
  loading: boolean;
  banner?: ReactNode;
  zoneNote: string;
};

function renderWidget(item: LayoutItem, env: Omit<WidgetEnv, 'phone'>, phone: boolean): ReactNode {
  const { view, timezone, now } = env;
  const dashboard = view?.dashboard;
  switch (item.id) {
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
    case 'nextPublication':
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
    case 'latestYoutube':
      return env.analytics ? (
        <AnalyticsWidget id="latestYoutube" title="Последний ролик · YouTube" onOpenAll={env.analytics.onOpenAll}>
          {env.analytics.latestYoutube}
        </AnalyticsWidget>
      ) : null;
    case 'latestTiktok':
      return env.analytics ? (
        <AnalyticsWidget id="latestTiktok" title="Последний ролик · TikTok" onOpenAll={env.analytics.onOpenAll}>
          {env.analytics.latestTiktok}
        </AnalyticsWidget>
      ) : null;
    case 'trending':
      return env.analytics ? (
        <AnalyticsWidget id="trending" title={copy.analytics.top} onOpenAll={env.analytics.onOpenAll}>
          {env.analytics.trending}
        </AnalyticsWidget>
      ) : null;
    case 'ai':
      return env.ai ? (
        <Widget id="ai" title={copy.ai.title} action={env.ai.badge}>
          {env.ai.body}
        </Widget>
      ) : null;
    case 'dota':
      return env.dota ? (
        <Widget id="dota" title={copy.dota.title}>
          {env.dota}
        </Widget>
      ) : null;
    case 'sources':
      return (
        <SourcesWidget rows={env.sources?.rows} {...(env.sources?.footer ? { footer: env.sources.footer } : {})} />
      );
  }
}

/** Grid placement of one widget: its span from a medium screen up. */
function cellStyle(item: LayoutItem): CSSProperties {
  return { '--w': item.w } as CSSProperties;
}

/**
 * One layout for loading and loaded: the skeleton is this same tree without data, so nothing jumps when the
 * response arrives (docs/design/README.md §6). Widgets keep one reading order on every screen.
 */
export function DashboardLayout({ env, loading, banner, zoneNote }: LayoutProps) {
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
      <div className={styles.grid}>
        {LAYOUT.filter(
          (item) => (item.id !== 'ai' || env.ai !== undefined) && (item.id !== 'dota' || env.dota !== undefined)
        )
          .map((item) => (item.id === 'today' && env.ai === undefined ? { ...item, w: 12 as const } : item))
          .map((item) =>
            (item.id === 'nextPublication' || item.id === 'week') && env.dota === undefined
              ? { ...item, w: 6 as const }
              : item
          )
          .map((item) => (
            <div key={item.id} className={styles.cell} style={cellStyle(item)}>
              {renderWidget(item, full, phone)}
            </div>
          ))}
      </div>
    </div>
  );
}
