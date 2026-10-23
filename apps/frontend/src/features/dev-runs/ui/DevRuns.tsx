import type { DevRunKind } from '@alexeev/contracts';
import { ApiError } from '../../../shared/api/http-client';
import { Banner, Button, ErrorState, Skeleton } from '../../../shared/ui';
import { useDevRunCandidates, useStartDevRun } from '../api/dev-runs-api';
import styles from './DevRuns.module.css';

const KIND_LABEL: Record<DevRunKind, string> = {
  patch: 'Последний патч',
  hotfix: 'Последний хотфикс',
  news: 'Последняя новость',
  event: 'Последний ивент (серия постов)',
  treasure: 'Последнее сокровище',
  treasure_follow_up: 'Подробности сокровища (сеты, шансы, цена)'
};

const REASON_TEXT: Record<string, string> = {
  AI_WRITING: 'ИИ ещё пишет этот анонс — дождитесь его поста.',
  NO_EVENT: 'На DEV нет такого анонса.',
  NO_TREASURE_PAGE: 'На Liquipedia ещё нет страницы этого сокровища.',
  LIQUIPEDIA_UNAVAILABLE: 'Liquipedia не ответила — попробуйте позже.',
  NO_OWNER_CHAT: 'Не настроен чат владельца.',
  DEV_RUNS_OFF: 'Запуск есть только на DEV.'
};

/**
 * DEV only (owner, 23.10.2026): each kind of automatic post, run again from its newest announcement — the writer, the
 * pictures and the publishing to the test channel, as Cron would. Every press is paid AI work.
 */
export function DevRuns() {
  const candidates = useDevRunCandidates();
  const start = useStartDevRun();
  if (candidates.isPending) return <Skeleton height={320} />;
  if (candidates.isError)
    return <ErrorState message="Не удалось загрузить анонсы." onRetry={() => void candidates.refetch()} />;
  const error = start.error;
  const reason = error instanceof ApiError ? error.reason : undefined;
  return (
    <>
      {error ? (
        <Banner tone="error" title="Не запущено" onDismiss={() => start.reset()}>
          {(reason === undefined ? undefined : REASON_TEXT[reason]) ?? error.message}
        </Banner>
      ) : start.data ? (
        <Banner tone="info" title={`Запущено: ${start.data.title}`} onDismiss={() => start.reset()}>
          Ход работы придёт в чат с ботом, готовый пост — в тестовый канал.
        </Banner>
      ) : null}
      <ul className={styles.list} aria-label="Виды автопостов">
        {candidates.data.items.map((item) => (
          <li key={item.kind} className={styles.row}>
            <span className={styles.text}>
              <span className={styles.kind}>{KIND_LABEL[item.kind]}</span>
              <span className={styles.event}>{item.title ?? 'На DEV нет такого анонса'}</span>
            </span>
            <Button
              variant="secondary"
              icon="send"
              isDisabled={item.externalId === null || start.isPending}
              isLoading={start.isPending && start.variables === item.kind}
              onPress={() => start.mutate(item.kind)}
            >
              Запустить (платно)
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}
