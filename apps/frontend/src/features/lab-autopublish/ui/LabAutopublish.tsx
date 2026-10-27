import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { formatDayClock } from '../../../shared/lib/clock';
import { Button, EmptyState, ErrorState, Skeleton } from '../../../shared/ui';
import { labAnnouncementsQueryOptions, useLabAutopublish } from '../api/lab-autopublish-api';
import styles from './LabAutopublish.module.css';

const REASONS: Record<string, string> = {
  AI_WRITING: 'ИИ уже пишет этот пост.',
  EVENT_HIDDEN: 'Анонс скрыт в «Источниках».',
  NOT_AI_SOURCE: 'ИИ пишет только анонсы Steam.',
  NO_OWNER_CHAT: 'Чат с ботом не настроен.'
};

type Props = { timezone: string };

/**
 * «Тестирование» → «Автопубликация» (owner, 23.10.2026; moved here 26.10.2026): a Steam announcement without a post goes
 * the whole automatic way, as if Cron had just found it — written, fact-checked and, when DEV's automatic publishing is
 * on, published without the owner. The press's status stays in its own row.
 */
export function LabAutopublish({ timezone }: Props) {
  const list = useQuery(labAnnouncementsQueryOptions());
  const run = useLabAutopublish();
  const [last, setLast] = useState<string | null>(null);

  if (list.isPending)
    return (
      <div aria-busy="true">
        <Skeleton lines={4} />
      </div>
    );
  if (list.isError)
    return (
      <ErrorState
        title="Анонсы не загрузились"
        message={list.error.message}
        {...(list.error instanceof ApiError && list.error.requestId ? { requestId: list.error.requestId } : {})}
        onRetry={() => void list.refetch()}
      />
    );
  if (list.data.length === 0)
    return <EmptyState title="Нет анонсов без поста" description="Новые анонсы Steam появятся здесь сами." />;

  const failure =
    run.error === null
      ? null
      : run.error instanceof ApiError && run.error.reason !== undefined
        ? (REASONS[run.error.reason] ?? `${run.error.message} (${run.error.reason})`)
        : run.error.message;
  const status = run.isPending
    ? 'Ставлю в очередь…'
    : failure !== null
      ? `Не запущено: ${failure}`
      : run.data
        ? 'ИИ пишет — дальше всё как у Cron: проверка фактов и публикация.'
        : '';

  return (
    <ul className={styles.list}>
      {list.data.map((event) => (
        <li key={event.id} className={styles.row}>
          <span className={styles.text}>
            <span className={styles.label}>{event.title}</span>
            <span className={styles.note}>
              {formatDayClock(event.publishedAt, timezone)}
              {event.isPast ? ' · до наблюдения' : ''}
              {event.aiWriting ? ' · ИИ пишет…' : ''}
            </span>
            {/* Every row keeps its live region so a status appearing after the press is announced. */}
            <output className={failure !== null && last === event.id ? styles.failed : styles.status}>
              {last === event.id ? status : ''}
            </output>
          </span>
          <Button
            size="sm"
            variant="secondary"
            isLoading={run.isPending && last === event.id}
            isDisabled={run.isPending || event.aiWriting}
            onPress={() => {
              setLast(event.id);
              run.mutate(event.id);
            }}
          >
            Проверить
          </Button>
        </li>
      ))}
    </ul>
  );
}
