import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/http-client';
import { Banner, ErrorState, Panel, Skeleton, StatusBadge } from '../../../shared/ui';
import { botStatusQueryOptions } from '../api/bot-queries';
import { BADGE, botStateOf } from '../model/bot-state';
import { botCopy } from './copy';
import styles from './BotStatusSummary.module.css';

const copy = botCopy;

/** The panel before its data exists, in the loaded row's shape (badge, state line), without a request. */
export function BotStatusSkeleton() {
  return (
    <Panel title="Связь с ботом">
      <output className={styles.summary} aria-busy="true" aria-label={copy.loading}>
        <Skeleton width={96} height="var(--size-target-min)" radius="var(--radius-pill)" />
        <p className={styles.state}>
          <Skeleton width={140} height="1lh" />
        </p>
      </output>
    </Panel>
  );
}

export function BotStatusSummary() {
  const query = useQuery(botStatusQueryOptions());

  if (query.isPending) return <BotStatusSkeleton />;

  if (query.isError) {
    const forbidden = query.error instanceof ApiError && query.error.status === 403;
    return (
      <Panel title="Связь с ботом">
        {forbidden ? (
          <Banner tone="warning" title={copy.forbidden} />
        ) : (
          <ErrorState
            message={copy.error}
            requestId={query.error instanceof ApiError ? query.error.requestId : undefined}
            onRetry={() => void query.refetch()}
          />
        )}
      </Panel>
    );
  }

  const status = query.data;
  const state = botStateOf(status);

  return (
    <Panel title="Связь с ботом">
      <div className={styles.summary}>
        <StatusBadge status={BADGE[state]} />
        <p className={styles.state}>{copy.state[state]}</p>
        {status.botUsername ? <span className={styles.username}>@{status.botUsername}</span> : null}
      </div>
    </Panel>
  );
}
