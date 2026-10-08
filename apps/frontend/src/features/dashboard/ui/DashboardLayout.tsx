import type { DashboardDto } from '@alexeev/contracts';
import type { ReactNode } from 'react';
import { VisuallyHidden } from '../../../shared/ui';
import type { AttentionRow } from '../model/attention-rows';
import { AttentionBlock } from './AttentionBlock';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { AnalyticsPreview, DotaPulsePreview, WatchlistPreview } from './PreviewBlocks';
import { RecentSentBlock, UpcomingBlock } from './SideBlocks';
import { SummaryCards } from './SummaryCards';
import { TodayBlock } from './TodayBlock';

type Loaded = { dashboard: DashboardDto; rows: readonly AttentionRow[]; checking: boolean; nextLabel: string };

type LayoutProps = {
  /** Undefined while loading: every panel renders its header and same-height skeleton rows. */
  data?: Loaded;
  banner?: ReactNode;
  zoneNote: string;
  onOpenPublication: (publicationId: string) => void;
  onSchedule: () => void;
};

/**
 * One layout for loading and loaded: the skeleton is this same tree without data, so nothing jumps when the
 * response arrives (docs/design/README.md §6).
 */
export function DashboardLayout({ data, banner, zoneNote, onOpenPublication, onSchedule }: LayoutProps) {
  const dashboard = data?.dashboard;
  return (
    <div className={styles.root} aria-busy={data === undefined || undefined}>
      {data === undefined ? (
        <VisuallyHidden>
          <output>{copy.loading}</output>
        </VisuallyHidden>
      ) : null}
      {banner}

      <SummaryCards
        {...(data && dashboard
          ? {
              values: {
                todayTotal: dashboard.todayTotal,
                attentionTotal: data.rows.length,
                nextLabel: data.nextLabel,
                recentCount: dashboard.recentSent.length
              }
            }
          : {})}
      />

      <div className={styles.dashboardGrid}>
        <div className={styles.attentionCell}>
          <AttentionBlock
            rows={data?.rows}
            total={dashboard?.attentionTotal ?? 0}
            checking={data?.checking ?? false}
            onOpenPublication={onOpenPublication}
          />
        </div>

        <div className={styles.dotaCell}>
          <DotaPulsePreview />
        </div>

        <div className={styles.todayCell}>
          <TodayBlock
            items={dashboard?.today}
            total={dashboard?.todayTotal ?? 0}
            zoneNote={zoneNote}
            onSchedule={onSchedule}
          />
        </div>

        <div className={styles.analyticsCell}>
          <AnalyticsPreview />
        </div>

        <div className={styles.upcomingCell}>
          <UpcomingBlock items={dashboard?.upcoming} />
        </div>

        <div className={styles.watchlistCell}>
          <WatchlistPreview />
        </div>

        <div className={styles.recentCell}>
          <RecentSentBlock items={dashboard?.recentSent} />
        </div>
      </div>
    </div>
  );
}
