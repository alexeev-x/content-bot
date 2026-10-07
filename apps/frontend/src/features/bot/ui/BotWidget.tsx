import type { BotStatusDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Card, Drawer, Skeleton, StatusBadge, useToast } from '../../../shared/ui';
import { botStatusQueryOptions, useConnectBot } from '../api/bot-queries';
import { BADGE, botStateOf, type BotState } from '../model/bot-state';
import { describeConnectFailure } from '../model/connect-failure';
import { BotConnection } from './BotConnection';
import { botCopy } from './copy';
import styles from './BotWidget.module.css';

const copy = botCopy;
const w = copy.widget;

type Line = { headline: string; detail: string[]; action: 'connect' | 'reconnect' | 'none' };

function describe(status: BotStatusDto, state: BotState): Line {
  const webhook = status.webhook;
  const detail: string[] = [];
  if (state === 'not_configured') {
    return { headline: w.notConfigured, detail: [w.missing(status.missing.join(', '))], action: 'none' };
  }
  if (webhook?.lastErrorMessage) detail.push(webhook.lastErrorMessage);
  if (webhook && webhook.pendingUpdateCount > 0) detail.push(copy.pending(webhook.pendingUpdateCount));
  if (state === 'not_connected') return { headline: w.notConnected, detail, action: 'connect' };
  if (state === 'other_address') return { headline: w.otherAddress, detail, action: 'connect' };
  if (webhook?.lastErrorMessage) return { headline: w.deliveryError, detail, action: 'reconnect' };
  return { headline: w.healthy(status.botUsername), detail, action: 'none' };
}

/** Compact bot status for the dashboard: one calm line when healthy, a reason and one action otherwise. */
export function BotWidget() {
  const query = useQuery(botStatusQueryOptions());
  const connect = useConnectBot();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  function runConnect() {
    connect.mutate(undefined, {
      onSuccess: () => toast.show({ tone: 'success', title: copy.connected })
    });
  }

  let body;
  if (query.isPending) {
    body = (
      <output className={styles.line} aria-busy="true" aria-label={w.loading}>
        <Skeleton width={240} height={24} />
      </output>
    );
  } else if (query.isError) {
    const migration = describeConnectFailure(query.error).kind === 'migration_pending';
    body = (
      <div className={styles.stack} role="alert">
        <div className={styles.line}>
          <p className={styles.headline}>{migration ? copy.failure.migration_pending.title : w.statusError}</p>
          <div className={styles.actions}>
            <Button variant="secondary" isLoading={query.isFetching} onPress={() => void query.refetch()}>
              {copy.retry}
            </Button>
          </div>
        </div>
        {migration ? <p className={styles.muted}>{copy.failure.migration_pending.body}</p> : null}
      </div>
    );
  } else {
    const state = botStateOf(query.data);
    const line = describe(query.data, state);
    const failure = connect.isError ? describeConnectFailure(connect.error) : undefined;
    const failureBody = failure
      ? failure.kind === 'rate_limited' && failure.retryAfterSeconds !== undefined
        ? copy.wait(failure.retryAfterSeconds)
        : 'body' in copy.failure[failure.kind]
          ? (copy.failure[failure.kind] as { body: string }).body
          : null
      : null;
    body = (
      <div className={styles.stack}>
        <div className={styles.line}>
          <div className={styles.status}>
            <p className={styles.headline}>{line.headline}</p>
            <StatusBadge status={BADGE[state]} />
          </div>
          <div className={styles.actions}>
            {line.action !== 'none' ? (
              <Button variant="primary" isLoading={connect.isPending} onPress={runConnect}>
                {line.action === 'connect' ? w.connect : w.reconnect}
              </Button>
            ) : null}
            <Button variant="ghost" onPress={() => setOpen(true)}>
              {w.details}
            </Button>
          </div>
        </div>
        {line.detail.map((text) => (
          <p key={text} className={styles.muted}>
            {text}
          </p>
        ))}
        {failure ? (
          <div role="alert" className={styles.failure}>
            <p className={styles.headline}>{copy.failure[failure.kind].title}</p>
            {failureBody ? <p className={styles.muted}>{failureBody}</p> : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Card>
      {body}
      <Drawer isOpen={open} onOpenChange={setOpen} title={w.detailsTitle}>
        <BotConnection />
      </Drawer>
    </Card>
  );
}
