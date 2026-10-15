import type { ContentPlatform } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/http-client';
import { useNow } from '../../../shared/lib/use-now';
import { Button, ErrorState, Panel, useToast } from '../../../shared/ui';
import { contentOverviewQueryOptions, useSyncContent } from '../api/content-analytics-queries';
import { copy } from './copy';
import styles from './ContentAnalytics.module.css';
import { ItemDrawer } from './ItemDrawer';
import { ItemsTable } from './ItemsTable';
import { SourceTiles } from './SourceTiles';
import { TopList } from './TopList';

type Props = {
  timezone: string;
  platform: ContentPlatform | undefined;
  onPlatformChange: (platform: ContentPlatform | undefined) => void;
  openId: string | undefined;
  onOpenChange: (id: string | undefined) => void;
};

/** «Аналитика»: the platform strip, the month's leaders and every collected post or video. */
export function AnalyticsBoard({ timezone, platform, onPlatformChange, openId, onOpenChange }: Props) {
  const overview = useQuery(contentOverviewQueryOptions());
  const now = useNow().getTime();

  if (overview.isError && overview.data === undefined) {
    const requestId = overview.error instanceof ApiError ? overview.error.requestId : undefined;
    return (
      <ErrorState
        message={copy.loadError}
        {...(requestId ? { requestId } : {})}
        onRetry={() => void overview.refetch()}
      />
    );
  }

  return (
    <div className={styles.board} aria-busy={overview.isPending || undefined}>
      <SourceTiles overview={overview.data} now={now} />
      <Panel title={copy.top.title} headingLevel={2} quiet>
        <TopList items={overview.data?.top} onOpen={onOpenChange} />
      </Panel>
      <ItemsTable
        platform={platform}
        onPlatformChange={onPlatformChange}
        timezone={timezone}
        activeId={openId}
        onOpen={onOpenChange}
      />
      <ItemDrawer id={openId} onClose={() => onOpenChange(undefined)} timezone={timezone} now={now} />
    </div>
  );
}

/** Page header action: collects now (the server skips a source collected in the last 5 minutes). */
export function RefreshAnalyticsButton() {
  const sync = useSyncContent();
  const toast = useToast();
  return (
    <Button
      variant="secondary"
      icon="retry"
      isLoading={sync.isPending}
      onPress={() =>
        sync.mutate(undefined, {
          onSuccess: () => toast.show({ tone: 'success', title: copy.refreshed }),
          onError: () => toast.show({ tone: 'error', title: copy.refreshFailed })
        })
      }
    >
      {copy.refresh}
    </Button>
  );
}
