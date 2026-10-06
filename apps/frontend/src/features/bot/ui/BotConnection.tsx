import type { BotStatusDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/http-client';
import { classifyApiError } from '../../../shared/api/error-kind';
import { Banner, Button, ErrorState, Skeleton, StatusBadge, useToast } from '../../../shared/ui';
import { botStatusQueryOptions, useConnectBot } from '../api/bot-queries';
import { BADGE, botStateOf } from '../model/bot-state';
import { describeConnectFailure } from '../model/connect-failure';
import { formatLocalDateTime } from '../model/format-date-time';
import { botCopy } from './copy';
import styles from './BotConnection.module.css';

const copy = botCopy;

export function BotConnection() {
  const query = useQuery(botStatusQueryOptions());
  const connect = useConnectBot();
  const toast = useToast();

  function runConnect() {
    connect.mutate(undefined, {
      onSuccess: () => toast.show({ tone: 'success', title: copy.connected })
    });
  }

  if (query.isPending) {
    return (
      <output className={styles.skeleton} aria-busy="true" aria-label={copy.loading}>
        <Skeleton width={220} height={28} />
        <Skeleton lines={2} height={14} />
        <Skeleton width={180} height={44} radius="var(--radius-2)" />
      </output>
    );
  }
  if (query.isError) {
    const forbidden = classifyApiError(query.error) === 'forbidden';
    return (
      <ErrorState
        message={forbidden ? copy.forbidden : copy.error}
        requestId={query.error instanceof ApiError ? query.error.requestId : undefined}
        {...(forbidden ? {} : { onRetry: () => void query.refetch() })}
      />
    );
  }

  const status: BotStatusDto = query.data;
  const state = botStateOf(status);
  const notConfigured = state === 'not_configured';
  const failure = connect.isError ? describeConnectFailure(connect.error) : undefined;

  return (
    <div className={styles.stack}>
      <div className={styles.head}>
        <StatusBadge status={BADGE[state]} />
        <p className={styles.headline}>{copy.state[state]}</p>
      </div>

      {notConfigured ? (
        <>
          <p className={styles.muted}>{copy.missingList(status.missing.join(', '))}</p>
          {status.missing.includes('TELEGRAM_WEBHOOK_SECRET') ? (
            <p className={styles.muted}>{copy.secretRule}</p>
          ) : null}
          <p className={styles.muted}>{copy.missingHint}</p>
        </>
      ) : null}

      {state === 'other_address' && status.webhook?.url ? (
        <div>
          <p className={styles.muted}>{copy.currentAddress}</p>
          <p className={styles.url}>{status.webhook.url}</p>
          <p className={styles.muted}>{copy.otherAddressHint}</p>
        </div>
      ) : null}

      {status.webhook?.lastErrorMessage ? (
        <Banner tone="warning" title={copy.deliveryErrorTitle}>
          <p>{status.webhook.lastErrorMessage}</p>
          {status.webhook.lastErrorAt ? (
            <p>{copy.deliveryErrorAt(formatLocalDateTime(status.webhook.lastErrorAt))}</p>
          ) : null}
        </Banner>
      ) : null}
      {status.webhook && status.webhook.pendingUpdateCount > 0 ? (
        <p className={styles.muted}>{copy.pending(status.webhook.pendingUpdateCount)}</p>
      ) : null}

      {failure ? (
        <Banner
          tone="error"
          title={copy.failure[failure.kind].title}
          action={
            failure.kind === 'forbidden' ? undefined : (
              <Button variant="secondary" size="sm" onPress={runConnect} isLoading={connect.isPending}>
                {copy.retry}
              </Button>
            )
          }
        >
          {failure.kind === 'rate_limited' && failure.retryAfterSeconds !== undefined
            ? copy.wait(failure.retryAfterSeconds)
            : 'body' in copy.failure[failure.kind]
              ? (copy.failure[failure.kind] as { body: string }).body
              : null}
          {failure.requestId ? <p className={styles.muted}>{failure.requestId}</p> : null}
        </Banner>
      ) : null}

      <div className={styles.actions}>
        <Button
          variant={state === 'connected' ? 'secondary' : 'primary'}
          isDisabled={notConfigured}
          isLoading={connect.isPending}
          onPress={runConnect}
        >
          {connect.isPending ? copy.connecting : state === 'connected' ? copy.reconnect : copy.connect}
        </Button>
        <Button variant="ghost" icon="retry" isLoading={query.isFetching} onPress={() => void query.refetch()}>
          {copy.refresh}
        </Button>
      </div>
      {notConfigured ? <p className={styles.muted}>{copy.connectDisabledReason}</p> : null}

      <p className={styles.muted}>{copy.info}</p>
    </div>
  );
}
