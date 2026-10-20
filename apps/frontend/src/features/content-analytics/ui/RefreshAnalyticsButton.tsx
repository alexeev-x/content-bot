import { Button, IconButton, useToast } from '../../../shared/ui';
import { useSyncContent } from '../api/content-analytics-queries';
import { copy } from './copy';

/**
 * Collects now (the server skips a source collected in the last 5 minutes). `compact`: an icon named «Обновить»,
 * so the analytics filters fit one row on a phone.
 */
export function RefreshAnalyticsButton({ compact = false }: { compact?: boolean }) {
  const sync = useSyncContent();
  const toast = useToast();
  const refresh = () =>
    sync.mutate(undefined, {
      onSuccess: () => toast.show({ tone: 'success', title: copy.refreshed }),
      onError: () => toast.show({ tone: 'error', title: copy.refreshFailed })
    });
  return compact ? (
    <IconButton
      variant="secondary"
      size="target"
      icon="retry"
      label={copy.refresh}
      isLoading={sync.isPending}
      onPress={refresh}
    />
  ) : (
    <Button variant="secondary" icon="retry" isLoading={sync.isPending} onPress={refresh}>
      {copy.refresh}
    </Button>
  );
}
