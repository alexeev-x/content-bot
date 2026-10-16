import type { ContentAnalyticsOverviewDto } from '@alexeev/contracts';
import { relativeTimeRu } from '../../../shared/lib/ru-format';
import { useState } from 'react';
import { Button, ConfirmDialog, Icon, Skeleton, useToast } from '../../../shared/ui';
import { useConnectTikTok, useDisconnectTikTok } from '../api/content-analytics-queries';
import { PLATFORM_LABEL } from '../model/format';
import { PLATFORMS } from '../model/report';
import { collectErrorText, copy } from './copy';
import { PlatformGlyph } from './PlatformGlyph';
import styles from './Report.module.css';

type Props = {
  overview: ContentAnalyticsOverviewDto | undefined;
  now: number;
  /** `list`: one platform per row (the «Источники» dialog). */
  layout?: 'row' | 'list';
};

/** One quiet line per platform: connected and fresh, not connected (with what to do) or failing (with why). */
export function SourceStatusRow({ overview, now, layout = 'row' }: Props) {
  return (
    <ul className={styles.sources} data-layout={layout} aria-label={copy.sources.label}>
      {PLATFORMS.map((platform) => {
        const source = overview?.sources.find((candidate) => candidate.platform === platform);
        const tone =
          source === undefined ? 'muted' : source.state === 'error' ? 'bad' : source.state === 'ok' ? 'good' : 'muted';
        return (
          <li key={platform} className={styles.source} data-tone={tone}>
            <PlatformGlyph platform={platform} withLabel />
            {source === undefined ? (
              <>
                <Skeleton width={120} height={12} />
                {platform === 'tiktok' ? (
                  <Skeleton width={104} height="var(--size-button-sm)" radius="var(--radius-2)" />
                ) : null}
              </>
            ) : (
              <span className={styles.sourceState}>
                {source.state === 'ok' ? <Icon name="check-circle" size={14} /> : null}
                {source.state === 'error' ? <Icon name="alert" size={14} /> : null}
                {source.state === 'ok' && source.lastSyncedAt
                  ? copy.updated(relativeTimeRu(source.lastSyncedAt, now))
                  : source.state === 'error'
                    ? collectErrorText(source.errorCode)
                    : source.state === 'pending'
                      ? copy.state.pending
                      : copy.state.not_configured}
              </span>
            )}
            {source?.connection === 'available' ? <ConnectTikTokButton /> : null}
            {source?.connection === 'connected' ? <DisconnectTikTokButton /> : null}
            {source?.profileUrl ? (
              <a
                className={styles.sourceLink}
                href={source.profileUrl}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={copy.openProfile(PLATFORM_LABEL[platform])}
              >
                <Icon name="external" size={14} />
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function ConnectTikTokButton() {
  const connect = useConnectTikTok();
  const toast = useToast();
  return (
    <Button
      size="sm"
      isLoading={connect.isPending}
      onPress={() =>
        connect.mutate(undefined, { onError: () => toast.show({ tone: 'error', title: copy.tiktok.connectFailed }) })
      }
    >
      {copy.tiktok.connect}
    </Button>
  );
}

function DisconnectTikTokButton() {
  const [open, setOpen] = useState(false);
  const disconnect = useDisconnectTikTok();
  const toast = useToast();
  return (
    <>
      <Button size="sm" variant="ghost" onPress={() => setOpen(true)}>
        {copy.tiktok.disconnect}
      </Button>
      <ConfirmDialog
        isOpen={open}
        onOpenChange={setOpen}
        title={copy.tiktok.disconnectTitle}
        description={copy.tiktok.disconnectDescription}
        confirmLabel={copy.tiktok.disconnectConfirm}
        cancelLabel={copy.tiktok.disconnectCancel}
        tone="danger"
        isPending={disconnect.isPending}
        onConfirm={() =>
          disconnect.mutate(undefined, {
            onSuccess: () => {
              setOpen(false);
              toast.show({ tone: 'success', title: copy.tiktok.disconnected });
            },
            onError: () => toast.show({ tone: 'error', title: copy.refreshFailed })
          })
        }
      />
    </>
  );
}
