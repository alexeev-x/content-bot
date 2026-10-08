import type { DashboardDto, DashboardWidget } from '@alexeev/contracts';
import type { UseQueryResult } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/http-client';
import { classifyApiError } from '../../../shared/api/error-kind';
import type { StatusCheck } from '../../../shared/lib/status-check';
import { Banner, Button, ErrorState } from '../../../shared/ui';
import { buildView } from '../model/build-view';
import type { ServiceRow } from '../model/service-rows';
import { readsDashboard } from '../model/widget-catalog';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { DashboardLayout } from './DashboardLayout';
import { EmptyWidgets } from './EmptyWidgets';
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
  onOpenPublication: (publicationId: string) => void;
  onNewPost: () => void;
  onOpenPosts: () => void;
  onOpenPost: (postId: string) => void;
  onAddChannel: () => void;
};

type Props = PageBindings & {
  widgets: readonly DashboardWidget[];
  /** Starts editing with the default layout / with the catalog open; absent while no revision is known. */
  onResetLayout?: () => void;
  onAddWidget?: () => void;
};

/** The view mode: the saved widgets, with the day summary read once for all the widgets that need it. */
export function Dashboard({
  widgets,
  query,
  checks,
  services,
  zoneNote,
  onOpenPublication,
  onNewPost,
  onOpenPosts,
  onOpenPost,
  onAddChannel,
  onResetLayout,
  onAddWidget
}: Props) {
  const wantsDay = widgets.some((widget) => readsDashboard(widget.type));
  const failed = wantsDay && !query.data && !query.isPending;
  // A failed day summary replaces only the widgets that read it, never a block of zeros; the rest stay.
  const visible = failed ? widgets.filter((widget) => !readsDashboard(widget.type)) : widgets;

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

  return (
    <>
      <DashboardLayout
        widgets={visible}
        loading={wantsDay && query.isPending}
        banner={banner}
        zoneNote={zoneNote}
        env={{
          view,
          services,
          skeleton: false,
          onOpenPublication,
          onNewPost,
          onOpenPosts,
          onOpenPost,
          onAddChannel
        }}
      />
      {widgets.length === 0 ? (
        <EmptyWidgets
          {...(onResetLayout ? { onReset: onResetLayout } : {})}
          {...(onAddWidget ? { onAdd: onAddWidget } : {})}
        />
      ) : null}
    </>
  );
}
