import type { IncidentDto } from '@alexeev/contracts';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { formatDayClock } from '../../../shared/lib/clock';
import { Button, ConfirmDialog, Icon, PanelRow, StatusBadge, useToast } from '../../../shared/ui';
import { useResolveIncident } from '../api/incidents-queries';
import { incidentReason } from '../model/incident-view';
import { CopyButton } from './CopyButton';
import { copy } from './copy';
import styles from './Incidents.module.css';

type Props = {
  incident: IncidentDto;
  timezone?: string;
  onOpenPublication: (publicationId: string) => void;
};

export function IncidentRow({ incident, timezone, onOpenPublication }: Props) {
  const toast = useToast();
  const [confirmClose, setConfirmClose] = useState(false);
  const resolve = useResolveIncident({
    onResolved: () => toast.show({ tone: 'success', title: copy.resolve.done })
  });
  const { publication } = incident;
  const isOpen = incident.resolvedAt === undefined;
  const isUnknown = incident.kind === 'publish_unknown';
  const title = publication?.postTitle ?? copy.row.unknownPost;

  const close = () =>
    resolve.mutate(incident.id, {
      onError: (error) => {
        // A publish_unknown incident is closed only by reconciliation, and the row explains that in place.
        if (error instanceof ApiError && error.reason === 'USE_RESOLVE_UNKNOWN') return;
        const requestId = error instanceof ApiError ? error.requestId : undefined;
        toast.show({
          tone: 'error',
          title: copy.resolve.failedTitle,
          ...(requestId ? { description: copy.resolve.requestId(requestId) } : {}),
          action: { label: copy.resolve.retry, onPress: close }
        });
      }
    });

  const needsResolveUnknown = resolve.error instanceof ApiError && resolve.error.reason === 'USE_RESOLVE_UNKNOWN';
  const reasonParts = [incidentReason(incident.code), copy.row.attempts(incident.attemptCount)];
  if (incident.resolvedAt) reasonParts.push(copy.row.closedAt(formatDayClock(incident.resolvedAt, timezone)));

  return (
    <PanelRow>
      <div className={styles.incident}>
        <div className={styles.main}>
          <div className={styles.head}>
            <StatusBadge status={isUnknown ? 'unknown' : 'failed'} />
            <strong className={styles.title}>{title}</strong>
          </div>
          <p className={styles.reason}>{reasonParts.join(' · ')}</p>
          {isOpen && isUnknown ? (
            <p className={styles.warning}>
              <Icon name="alert" size={14} />
              {copy.row.unknownWarning}
            </p>
          ) : null}
          <span className={styles.meta}>
            {publication?.destinationName ? <span>{publication.destinationName} · </span> : null}
            <time dateTime={incident.occurredAt}>{formatDayClock(incident.occurredAt, timezone)}</time>
          </span>
          {needsResolveUnknown ? (
            <p className={styles.notice} role="alert">
              {copy.resolve.useResolveUnknown}
              {publication ? (
                <>
                  {' '}
                  <Link to="/publications" search={{ id: publication.id }} className={styles.link}>
                    {copy.resolve.useResolveUnknownLink}
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
          {incident.jobId ? (
            <details className={styles.details}>
              <summary className={styles.summary}>{copy.row.details}</summary>
              <p className={styles.detailLine}>
                {copy.row.jobId}: <code>{incident.jobId}</code>
                <CopyButton value={incident.jobId} label={copy.row.jobId} />
              </p>
            </details>
          ) : null}
        </div>
        <div className={styles.actions}>
          {publication ? (
            <Button
              variant={isOpen && isUnknown ? 'primary' : 'secondary'}
              aria-label={isOpen && isUnknown ? copy.row.checkLabel(title) : copy.row.openLabel(title)}
              onPress={() => onOpenPublication(publication.id)}
            >
              {isOpen && isUnknown ? copy.row.check : copy.row.open}
            </Button>
          ) : null}
          {isOpen && !isUnknown ? (
            <Button
              variant="ghost"
              aria-label={copy.row.closeLabel(title)}
              isLoading={resolve.isPending}
              onPress={() => setConfirmClose(true)}
            >
              {copy.row.close}
            </Button>
          ) : null}
          <ConfirmDialog
            isOpen={confirmClose}
            onOpenChange={setConfirmClose}
            title={`Закрыть инцидент «${title}»?`}
            description="Он уйдёт из открытых. Публикацию это не меняет: если она не отправлена, отправьте её заново из «Публикаций»."
            confirmLabel="Да, закрыть"
            cancelLabel="Нет"
            tone="default"
            onConfirm={() => {
              setConfirmClose(false);
              close();
            }}
          />
        </div>
      </div>
    </PanelRow>
  );
}
