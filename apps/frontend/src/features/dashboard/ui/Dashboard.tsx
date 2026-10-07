import type { DashboardDto } from '@alexeev/contracts';
import type { UseQueryResult } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/http-client';
import { classifyApiError } from '../../../shared/api/error-kind';
import { formatDayClock } from '../../../shared/lib/clock';
import type { StatusCheck } from '../../../shared/lib/status-check';
import { Banner, Button, ErrorState } from '../../../shared/ui';
import { attentionRows } from '../model/attention-rows';
import { AttentionBlock } from './AttentionBlock';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { DashboardSkeleton } from './DashboardSkeleton';
import { AnalyticsPreview, DotaPulsePreview, WatchlistPreview } from './PreviewBlocks';
import { RecentSentBlock, UpcomingBlock } from './SideBlocks';
import { SummaryCards } from './SummaryCards';
import { TodayBlock } from './TodayBlock';

type Props = {
  /** From `useDashboardQuery`: the page owns it, because the status strip reacts to the same data. */
  query: UseQueryResult<DashboardDto>;
  /** The system checks of the status strip; the failing ones are listed under «Требует внимания». */
  checks: readonly StatusCheck[];
  /** «Europe/Chisinau, UTC+3», built by the page (the zone helpers live in another feature). */
  zoneNote: string;
  onOpenPublication: (publicationId: string) => void;
  onSchedule: () => void;
};

export function Dashboard({ query, checks, zoneNote, onOpenPublication, onSchedule }: Props) {
  if (query.isPending) return <DashboardSkeleton />;

  if (!query.data) {
    if (classifyApiError(query.error) === 'forbidden') {
      return <ErrorState title={copy.error.forbiddenTitle} message={copy.error.forbiddenMessage} />;
    }
    const requestId = query.error instanceof ApiError ? query.error.requestId : undefined;
    return (
      <ErrorState
        title={copy.error.title}
        message={copy.error.message}
        {...(requestId ? { requestId } : {})}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const data = query.data;
  const rows = attentionRows(data.attention, checks);
  const checking = checks.some((check) => check.tone === 'loading');
  const nextLabel = data.upcoming[0] ? formatDayClock(data.upcoming[0].scheduledAt) : '—';

  return (
    <div className={styles.root}>
      {query.isRefetchError ? (
        <Banner
          tone="warning"
          title={copy.stale.title}
          action={
            <Button size="sm" variant="secondary" isLoading={query.isFetching} onPress={() => void query.refetch()}>
              {copy.stale.refresh}
            </Button>
          }
        />
      ) : null}

      <SummaryCards
        todayTotal={data.todayTotal}
        attentionTotal={rows.length}
        nextLabel={nextLabel}
        recentCount={data.recentSent.length}
      />

      <div className={styles.dashboardGrid}>
        <div className={styles.attentionCell}>
          <AttentionBlock
            rows={rows}
            total={data.attentionTotal}
            checking={checking}
            onOpenPublication={onOpenPublication}
          />
        </div>

        <div className={styles.dotaCell}>
          <DotaPulsePreview />
        </div>

        <div className={styles.todayCell}>
          <TodayBlock items={data.today} total={data.todayTotal} zoneNote={zoneNote} onSchedule={onSchedule} />
        </div>

        <div className={styles.analyticsCell}>
          <AnalyticsPreview />
        </div>

        <div className={styles.upcomingCell}>
          <UpcomingBlock items={data.upcoming} />
        </div>

        <div className={styles.watchlistCell}>
          <WatchlistPreview />
        </div>

        <div className={styles.recentCell}>
          <RecentSentBlock items={data.recentSent} />
        </div>
      </div>
    </div>
  );
}
