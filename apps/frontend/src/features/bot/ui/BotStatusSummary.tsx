import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/http-client';
import {
  Banner,
  Button,
  ErrorState,
  IconBadge,
  IconButton,
  LinkButton,
  Panel,
  Skeleton,
  StatGrid,
  StatTile,
  StatusBadge,
  useToast
} from '../../../shared/ui';
import { botStatusQueryOptions } from '../api/bot-queries';
import { BADGE, botStateOf } from '../model/bot-state';
import { formatLocalDateTime } from '../model/format-date-time';
import { BotConnection } from './BotConnection';
import { botCopy } from './copy';
import styles from './BotStatusSummary.module.css';

const copy = botCopy;

/** The card before its data exists, in the loaded card's shape, without a request. */
export function BotStatusSkeleton() {
  return (
    <Panel>
      <output className={styles.card} aria-busy="true" aria-label={copy.loading}>
        <div className={styles.head}>
          <IconBadge name="send" size="lg" tone="muted" />
          <div className={styles.headText}>
            <div className={styles.titleRow}>
              <h2 className={styles.title}>{copy.card.title}</h2>
            </div>
            <p className={styles.state}>
              <Skeleton width={120} height="1lh" />
            </p>
          </div>
        </div>
        <div className={styles.nameRow}>
          <div className={styles.name}>
            <span className={styles.nameLabel}>{copy.card.username}</span>
            <Skeleton width={120} height="1lh" />
          </div>
          <Button variant="secondary" isDisabled>
            {copy.card.openChat}
          </Button>
        </div>
        <StatGrid minTile="md">
          <StatTile label={copy.card.address} value={<Skeleton width={120} height="1lh" />} icon="link" tone="muted" />
          <StatTile
            label={copy.card.pending}
            value={<Skeleton width={32} height="1lh" />}
            meta={copy.card.pendingMeta}
            icon="clock"
            tone="muted"
          />
          <StatTile
            label={copy.card.lastError}
            value={<Skeleton width={64} height="1lh" />}
            icon="check-circle"
            tone="muted"
          />
        </StatGrid>
      </output>
    </Panel>
  );
}

/** «Связь с ботом» on «Общие»: the state, the bot's name to copy or open, and what Telegram reports. */
export function BotStatusSummary() {
  const query = useQuery(botStatusQueryOptions());
  const toast = useToast();

  if (query.isPending) return <BotStatusSkeleton />;

  if (query.isError) {
    const forbidden = query.error instanceof ApiError && query.error.status === 403;
    return (
      <Panel title={copy.card.title}>
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
  const webhook = status.webhook;
  const username = status.botUsername;

  const copyName = () => {
    if (username === null) return;
    navigator.clipboard
      .writeText(`@${username}`)
      .then(() => toast.show({ tone: 'success', title: copy.card.copied }))
      .catch(() => toast.show({ tone: 'error', title: copy.card.copyFailed }));
  };

  return (
    <Panel>
      <div className={styles.card}>
        <div className={styles.head}>
          <IconBadge name="send" size="lg" tone={state === 'connected' ? 'accent' : 'retry'} />
          <div className={styles.headText}>
            <div className={styles.titleRow}>
              <h2 className={styles.title}>{copy.card.title}</h2>
              <StatusBadge status={BADGE[state]} />
            </div>
            <p className={styles.state}>{copy.state[state]}</p>
          </div>
        </div>

        {username ? (
          <div className={styles.nameRow}>
            <div className={styles.name}>
              <span className={styles.nameLabel}>{copy.card.username}</span>
              <span className={styles.nameValue}>@{username}</span>
              <IconButton label={copy.card.copy} icon="copy" onPress={copyName} />
            </div>
            <LinkButton href={`https://t.me/${username}`} target="_blank" rel="noreferrer" variant="secondary">
              {copy.card.openChat}
            </LinkButton>
          </div>
        ) : null}

        {webhook !== null ? (
          <StatGrid minTile="md">
            <StatTile
              label={copy.card.address}
              value={
                webhook.url === null
                  ? copy.card.addressNone
                  : webhook.pointsHere
                    ? copy.card.addressHere
                    : copy.card.addressOther
              }
              icon="link"
              tone={webhook.pointsHere ? 'done' : 'retry'}
            />
            <StatTile
              label={copy.card.pending}
              value={webhook.pendingUpdateCount}
              meta={copy.card.pendingMeta}
              icon="clock"
              tone={webhook.pendingUpdateCount > 0 ? 'retry' : 'done'}
            />
            <StatTile
              label={copy.card.lastError}
              value={webhook.lastErrorAt === null ? copy.card.noError : formatLocalDateTime(webhook.lastErrorAt)}
              icon={webhook.lastErrorAt === null ? 'check-circle' : 'alert'}
              tone={webhook.lastErrorAt === null ? 'done' : 'failed'}
            />
          </StatGrid>
        ) : null}

        {/* Anything but a working connection needs the full panel: what is missing and the connect button. */}
        {state === 'connected' ? null : <BotConnection hideState />}
      </div>
    </Panel>
  );
}
