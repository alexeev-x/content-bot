import type { DashboardDto } from '@alexeev/contracts';
import type { UseQueryResult } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/http-client';
import { classifyApiError } from '../../../shared/api/error-kind';
import type { StatusCheck } from '../../../shared/lib/status-check';
import { Banner, Button, ErrorState } from '../../../shared/ui';
import { attentionRows } from '../model/attention-rows';
import { AttentionBlock } from './AttentionBlock';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { DashboardSkeleton } from './DashboardSkeleton';
import { RecentSentBlock, UpcomingBlock } from './SideBlocks';
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
  // Until every system check has answered, «Всё под контролем» would be a guess.
  const checking = checks.some((check) => check.tone === 'loading');

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
      <div className={styles.columns}>
        <div className={styles.column}>
          <AttentionBlock
            rows={rows}
            total={data.attentionTotal}
            checking={checking}
            onOpenPublication={onOpenPublication}
          />
          <TodayBlock items={data.today} total={data.todayTotal} zoneNote={zoneNote} onSchedule={onSchedule} />
        </div>
        <div className={styles.column}>
          <UpcomingBlock items={data.upcoming} />
          <RecentSentBlock items={data.recentSent} />
        </div>
      </div>
    </div>
  );
}
