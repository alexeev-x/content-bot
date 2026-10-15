import { Button, useToast } from '../../../shared/ui';
import { useSyncContent } from '../api/content-analytics-queries';
import { copy } from './copy';

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
