import type { IncidentDto } from '@alexeev/contracts';
import { Link } from '@tanstack/react-router';
import { ApiError } from '../../../shared/api/http-client';
import { formatDayClock } from '../../../shared/lib/clock';
import { Button, StatusBadge, useToast } from '../../../shared/ui';
import { useResolveIncident } from '../api/incidents-queries';
import { incidentReason } from '../model/incident-view';
import { CopyButton } from './CopyButton';
import { copy } from './copy';
import styles from './Incidents.module.css';

type Props = {
  incident: IncidentDto;
  onOpenPublication: (publicationId: string) => void;
};

export function IncidentRow({ incident, onOpenPublication }: Props) {
  const toast = useToast();
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
  if (incident.resolvedAt) reasonParts.push(copy.row.closedAt(formatDayClock(incident.resolvedAt)));

  return (
    <li className={styles.row}>
      <span className={styles.kind}>
        <StatusBadge status={isUnknown ? 'unknown' : 'failed'} />
      </span>
      <span className={styles.text}>
        <span className={styles.title} title={title}>
          {title}
        </span>
        <span className={styles.meta}>{reasonParts.join(' · ')}</span>
        {isOpen && isUnknown ? <span className={styles.warning}>{copy.row.unknownWarning}</span> : null}
      </span>
      <span className={styles.channel} title={publication?.destinationName}>
        {publication?.destinationName}
      </span>
      <time className={styles.time} dateTime={incident.occurredAt}>
        {formatDayClock(incident.occurredAt)}
      </time>
      <span className={styles.actions}>
        {publication ? (
          <Button
            variant="secondary"
            size="sm"
            aria-label={isOpen && isUnknown ? copy.row.checkLabel(title) : copy.row.openLabel(title)}
            onPress={() => onOpenPublication(publication.id)}
          >
            {isOpen && isUnknown ? copy.row.check : copy.row.open}
          </Button>
        ) : null}
        {isOpen && !isUnknown ? (
          <Button
            variant="secondary"
            size="sm"
            aria-label={copy.row.closeLabel(title)}
            isLoading={resolve.isPending}
            onPress={close}
          >
            {copy.row.close}
          </Button>
        ) : null}
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
    </li>
  );
}
