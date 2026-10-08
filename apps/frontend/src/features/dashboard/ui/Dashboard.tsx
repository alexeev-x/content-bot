import type { DashboardDto } from '@alexeev/contracts';
import type { UseQueryResult } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/http-client';
import { classifyApiError } from '../../../shared/api/error-kind';
import { formatDayClock } from '../../../shared/lib/clock';
import type { StatusCheck } from '../../../shared/lib/status-check';
import { Banner, Button, ErrorState } from '../../../shared/ui';
import { attentionRows } from '../model/attention-rows';
import { copy } from './copy';
import { DashboardLayout } from './DashboardLayout';
import { DashboardSkeleton } from './DashboardSkeleton';

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
  if (query.isPending) return <DashboardSkeleton zoneNote={zoneNote} />;

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
    <DashboardLayout
      banner={
        query.isRefetchError ? (
          <Banner
            tone="warning"
            title={copy.stale.title}
            action={
              <Button size="sm" variant="secondary" isLoading={query.isFetching} onPress={() => void query.refetch()}>
                {copy.stale.refresh}
              </Button>
            }
          />
        ) : null
      }
      data={{ dashboard: data, rows, checking, nextLabel }}
      zoneNote={zoneNote}
      onOpenPublication={onOpenPublication}
      onSchedule={onSchedule}
    />
  );
}
