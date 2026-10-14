import type { DashboardDto } from '@alexeev/contracts';
import type { UseQueryResult } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/http-client';
import { classifyApiError } from '../../../shared/api/error-kind';
import type { StatusCheck } from '../../../shared/lib/status-check';
import { Banner, Button, ErrorState } from '../../../shared/ui';
import { buildView } from '../model/build-view';
import { useDraftsQuery, useWeekQuery } from '../model/use-dashboard-query';
import { useTodayRange } from '../model/today-range';
import type { ServiceRow } from '../model/service-rows';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { DashboardLayout } from './DashboardLayout';
import type { WidgetEnv } from './widget-env';

export type PageBindings = {
  /** From `useDashboardQuery`: the page owns it, because the status strip reacts to the same data. */
  query: UseQueryResult<DashboardDto>;
  /** The system checks of the status strip; the failing ones are listed under «Требует внимания». */
  checks: readonly StatusCheck[];
  /** One line per service for the «Система» panel, mapped by the page from the same checks. */
  services: readonly ServiceRow[];
  /** «Europe/Chisinau, UTC+3», built by the page (the zone helpers live in another feature). */
  zoneNote: string;
  timezone?: string;
  onOpenPublication: (publicationId: string) => void;
  /** Opens the publication list for one owner-zone day (the bars of «Неделя»). */
  onOpenDay: (day: { from: string; to: string }) => void;
  onNewPost: () => void;
  onPublishDraft: (postId: string) => void;
};

/** The fixed Обзор: the day summary is read once for all the widgets that need it. */
export function Dashboard({
  query,
  checks,
  services,
  zoneNote,
  timezone = 'Europe/Moscow',
  onOpenPublication,
  onOpenDay,
  onNewPost,
  onPublishDraft
}: PageBindings) {
  const week = useWeekQuery(timezone, useTodayRange(timezone).from);
  const drafts = useDraftsQuery();
  // A failed day summary replaces the widgets that read it with one error, never a block of zeros.
  const failed = !query.data && !query.isPending;

  let view: WidgetEnv['view'];
  let failure = null;
  if (query.data) {
    view = buildView(query.data, checks, services);
  } else if (failed) {
    if (classifyApiError(query.error) === 'forbidden') {
      failure = <ErrorState title={copy.error.forbiddenTitle} message={copy.error.forbiddenMessage} />;
    } else {
      const requestId = query.error instanceof ApiError ? query.error.requestId : undefined;
      failure = (
        <ErrorState
          title={copy.error.title}
          message={copy.error.message}
          {...(requestId ? { requestId } : {})}
          onRetry={() => void query.refetch()}
        />
      );
    }
  }

  const banner = (
    <>
      {failure ? <div className={styles.failure}>{failure}</div> : null}
      {query.data && query.isRefetchError ? (
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
    </>
  );

  if (failure) return <div className={styles.root}>{banner}</div>;

  return (
    <DashboardLayout
      loading={query.isPending}
      banner={banner}
      zoneNote={zoneNote}
      env={{ view, services, week, drafts, timezone, onOpenPublication, onOpenDay, onNewPost, onPublishDraft }}
    />
  );
}
