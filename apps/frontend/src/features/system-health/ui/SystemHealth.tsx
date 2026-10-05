import { useQuery } from '@tanstack/react-query';
import { ru } from '../../../shared/lib/ru';
import { Button, Card } from '../../../shared/ui';
import { healthQueryOptions } from '../api/health';
import styles from './SystemHealth.module.css';

const formatter = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });

export function SystemHealth() {
  const { data, isPending, isError, refetch, isFetching } = useQuery(healthQueryOptions());

  return (
    <Card title={ru.health.title}>
      {isPending ? (
        <output className={styles.muted}>{ru.health.loading}</output>
      ) : isError ? (
        <div role="alert" className={styles.error}>
          <p>{ru.health.error}</p>
          <Button variant="secondary" onPress={() => void refetch()} isDisabled={isFetching}>
            {ru.health.retry}
          </Button>
        </div>
      ) : (
        <dl className={styles.list}>
          <div>
            <dt>{ru.health.service}</dt>
            <dd>
              {data.service}: {ru.health.ok}
            </dd>
          </div>
          <div>
            <dt>{ru.health.checkedAt}</dt>
            <dd>{formatter.format(new Date(data.time))}</dd>
          </div>
          <div>
            <dt>{ru.pages.posts}</dt>
            <dd>{data.publishingEnabled ? ru.health.publishingEnabled : ru.health.publishingDisabled}</dd>
          </div>
        </dl>
      )}
    </Card>
  );
}
