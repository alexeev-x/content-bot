import type { ReactNode } from 'react';
import { ownerDayRange } from '../../../shared/lib/owner-timezone';
import { useNow } from '../../../shared/lib/use-now';
import { useMediaQuery, VisuallyHidden } from '../../../shared/ui';
import { PHONE_QUERY } from '../model/phone';
import { AttentionCard } from './AttentionCard';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { DateChip } from './DateChip';
import { DayTimeline } from './DayTimeline';
import { Drafts } from './Drafts';
import { NextUp } from './NextUp';
import { RecentBubbles } from './RecentBubbles';
import { SystemLights } from './SystemLights';
import { WeekBars } from './WeekBars';
import type { WidgetEnv } from './widget-env';

type LayoutProps = {
  /** Everything the widgets need except the clock and the viewport, which the layout owns. */
  env: Omit<WidgetEnv, 'now' | 'phone'>;
  /** The `/dashboard` day is still loading: the root says so and its widgets draw skeletons. */
  loading: boolean;
  banner?: ReactNode;
  zoneNote: string;
};

/**
 * One layout for loading and loaded: the skeleton is this same tree without data, so nothing jumps when the
 * response arrives (docs/design/README.md §6). Widgets are listed in desktop reading order; a phone reorders them in CSS.
 */
export function DashboardLayout({ env, loading, banner, zoneNote }: LayoutProps) {
  const phone = useMediaQuery(PHONE_QUERY);
  const now = useNow();
  const { view, timezone } = env;
  const day = ownerDayRange(now, timezone);
  const dashboard = view?.dashboard;
  return (
    <div className={styles.root} aria-busy={loading || undefined}>
      {loading ? (
        <VisuallyHidden>
          <output>{copy.loading}</output>
        </VisuallyHidden>
      ) : null}
      {banner}
      <DateChip placement="below" zoneNote={zoneNote} timezone={timezone} />
      <div className={styles.grid}>
        <DayTimeline
          items={dashboard?.today}
          total={dashboard?.todayTotal ?? 0}
          day={day}
          now={now}
          timezone={timezone}
          phone={phone}
          onOpenPublication={env.onOpenPublication}
          onNewPost={env.onNewPost}
        />
        <NextUp
          today={dashboard?.today}
          upcoming={dashboard?.upcoming}
          now={now}
          timezone={timezone}
          onOpenPublication={env.onOpenPublication}
          onNewPost={env.onNewPost}
        />
        <AttentionCard
          rows={view?.rows}
          total={view?.attentionCount ?? 0}
          checking={view?.checking ?? false}
          onOpenPublication={env.onOpenPublication}
        />
        <WeekBars query={env.week} now={now} timezone={timezone} onOpenDay={env.onOpenDay} />
        <Drafts query={env.drafts} now={now} onPublish={env.onPublishDraft} onNewPost={env.onNewPost} />
        <RecentBubbles
          items={dashboard?.recentSent}
          now={now}
          timezone={timezone}
          phone={phone}
          onOpenPublication={env.onOpenPublication}
        />
        <SystemLights services={env.services} />
      </div>
    </div>
  );
}
