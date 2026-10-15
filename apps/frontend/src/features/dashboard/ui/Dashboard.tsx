import type { ActivityItemDto, DashboardDto } from '@alexeev/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { dayActivityQueryOptions } from '../api/activity-queries';
import { ApiError } from '../../../shared/api/http-client';
import { classifyApiError } from '../../../shared/api/error-kind';
import { Banner, Button, ErrorState } from '../../../shared/ui';
import { useDraftsQuery, useWeekQuery } from '../model/use-dashboard-query';
import { useTodayRange } from '../model/today-range';
import { ActivityDialog } from './ActivityDialog';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { DashboardLayout } from './DashboardLayout';
import type { WidgetEnv } from './widget-env';

export type PageBindings = {
  /** From `useDashboardQuery`: the page owns it, because the status strip reacts to the same data. */
  query: UseQueryResult<DashboardDto>;
  /** «Europe/Chisinau, UTC+3», built by the page (the zone helpers live in another feature). */
  zoneNote: string;
  timezone?: string;
  onOpenPublication: (publicationId: string) => void;
  /** Opens the publication list for one owner-zone day (the bars of «Неделя»). */
  onOpenDay: (day: { from: string; to: string }) => void;
  onNewPost: () => void;
  onPublishDraft: (postId: string) => void;
  /** Links from the activity dialog. */
  onOpenPost: (postId: string) => void;
  onOpenMedia: (media: { id: string; fileName: string }) => void;
  renderMediaPreview?: ((media: { id: string; fileName: string }) => ReactNode) | undefined;
  /** The content-analytics widget bodies; without them those widgets are not drawn. */
  analytics?: WidgetEnv['analytics'];
};

/** The fixed Обзор: the day summary is read once for all the widgets that need it. */
export function Dashboard({
  query,
  zoneNote,
  timezone = 'Europe/Moscow',
  onOpenPublication,
  onOpenDay,
  onNewPost,
  onPublishDraft,
  onOpenPost,
  onOpenMedia,
  renderMediaPreview,
  analytics
}: PageBindings) {
  const today = useTodayRange(timezone);
  const week = useWeekQuery(timezone, today.from);
  const dayEvents = useQuery(dayActivityQueryOptions(today.from, today.to)).data?.items;
  const [activity, setActivity] = useState<readonly ActivityItemDto[] | null>(null);
  const drafts = useDraftsQuery();
  // A failed day summary replaces the widgets that read it with one error, never a block of zeros.
  const failed = !query.data && !query.isPending;

  let view: WidgetEnv['view'];
  let failure = null;
  if (query.data) {
    view = { dashboard: query.data };
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

  const env = {
    view,
    week,
    drafts,
    timezone,
    onOpenPublication,
    onOpenDay,
    onNewPost,
    onPublishDraft,
    dayEvents,
    onOpenActivity: setActivity,
    analytics
  };
  return (
    <>
      <DashboardLayout loading={query.isPending} banner={banner} zoneNote={zoneNote} env={env} />
      <ActivityDialog
        items={activity}
        onClose={() => setActivity(null)}
        timezone={timezone}
        onOpenPost={onOpenPost}
        onOpenPublication={onOpenPublication}
        onOpenMedia={onOpenMedia}
        renderMediaPreview={renderMediaPreview}
      />
    </>
  );
}
