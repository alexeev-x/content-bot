import { useQuery } from '@tanstack/react-query';
import { useNow } from '../../../shared/lib/use-now';
import { ErrorState, Panel } from '../../../shared/ui';
import { contentOverviewQueryOptions } from '../api/content-analytics-queries';
import { PLATFORM_LABEL } from '../model/format';
import { copy } from './copy';
import { SourceStatusRow } from './SourceStatusRow';
import styles from './Widgets.module.css';

/** The sources of «Аналитика»: state per platform, what each needs, and the TikTok connection. */
export function AnalyticsSources() {
  const overview = useQuery(contentOverviewQueryOptions());
  const now = useNow().getTime();
  if (overview.isError && overview.data === undefined) {
    return <ErrorState message={copy.loadError} onRetry={() => void overview.refetch()} />;
  }
  const missing = (overview.data?.sources ?? []).filter(
    (source) => source.state === 'not_configured' && source.connection !== 'available'
  );
  return (
    <Panel title="Источники данных" headingLevel={2} quiet note="Сбор раз в час; «Обновить» собирает сразу">
      <div className={styles.body}>
        <SourceStatusRow overview={overview.data} now={now} layout="list" />
        {missing.map((source) => (
          <p key={source.platform} className={styles.muted}>
            {PLATFORM_LABEL[source.platform]}: {copy.setup[source.platform]}
          </p>
        ))}
      </div>
    </Panel>
  );
}

/** What on the analytics page needs the owner's attention in settings; null when nothing does. */
export function useSourcesAttention(): { tone: 'warning' | 'info'; text: string } | null {
  const overview = useQuery(contentOverviewQueryOptions());
  const sources = overview.data?.sources ?? [];
  const failing = sources.filter((source) => source.state === 'error');
  if (failing.length > 0) {
    return {
      tone: 'warning',
      text: `Сбор не удался: ${failing.map((source) => PLATFORM_LABEL[source.platform]).join(', ')}. Причина и повтор — в настройках.`
    };
  }
  const connectable = sources.filter((source) => source.connection === 'available');
  if (connectable.length > 0) {
    return {
      tone: 'info',
      text: `${connectable.map((source) => PLATFORM_LABEL[source.platform]).join(', ')} не подключён: подключите в настройках, и его ролики попадут в аналитику.`
    };
  }
  return null;
}
