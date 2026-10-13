import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/http-client';
import { Banner, ErrorState, Panel, Skeleton, StatusBadge } from '../../../shared/ui';
import { botStatusQueryOptions } from '../api/bot-queries';
import { BADGE, botStateOf } from '../model/bot-state';
import { botCopy } from './copy';
import styles from './BotStatusSummary.module.css';

const copy = botCopy;

export function BotStatusSummary() {
  const query = useQuery(botStatusQueryOptions());

  if (query.isPending) {
    return (
      <Panel title="Связь с ботом">
        <output className={styles.loading} aria-busy="true" aria-label={copy.loading}>
          <Skeleton width={160} height={24} />
          <Skeleton width={240} height={16} />
        </output>
      </Panel>
    );
  }

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
