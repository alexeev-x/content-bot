import { useQuery } from '@tanstack/react-query';
import { useNow } from '../../../shared/lib/use-now';
import { Button } from '../../../shared/ui';
import { contentOverviewQueryOptions } from '../api/content-analytics-queries';
import { copy } from './copy';
import styles from './ContentAnalytics.module.css';
import { SourceTiles } from './SourceTiles';
import { TopList } from './TopList';

/** Body of the Обзор widget «Аудитория»: the three platform cells, compact. */
export function AudienceSummary() {
  const overview = useQuery(contentOverviewQueryOptions());
  const now = useNow().getTime();
  if (overview.isError && overview.data === undefined) return <SummaryError onRetry={() => void overview.refetch()} />;
  return <SourceTiles overview={overview.data} now={now} compact />;
}

/** Body of the Обзор widget «Лучшее за 30 дней»: the top three. */
export function TopSummary({ onOpen }: { onOpen: (id: string) => void }) {
  const overview = useQuery(contentOverviewQueryOptions());
  if (overview.isError && overview.data === undefined) return <SummaryError onRetry={() => void overview.refetch()} />;
  return <TopList items={overview.data?.top} limit={3} onOpen={onOpen} />;
}

function SummaryError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={styles.quietBlock}>
      <p className={styles.tileNote}>{copy.widget.error}</p>
      <Button size="sm" variant="secondary" onPress={onRetry}>
        {copy.refresh}
      </Button>
    </div>
  );
}
