import type { PublicationDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { classifyApiError } from '../../../shared/api/error-kind';
import { Banner, Button, Drawer, ErrorState, Skeleton, StatusBadge, Timeline, Tooltip } from '../../../shared/ui';
import { PUBLICATION_POLL_MS, publicationQueryOptions } from '../api/publications-queries';
import { browserTimeZone, formatLong, formatUtc, formatWithZone, utcOffsetLabel } from '../model/format-time';
import { publicationActions } from '../model/publication-actions';
import { explainErrorCode } from '../model/publication-errors';
import { buildTimeline } from '../model/publication-timeline';
import { displayStatus, messageLink } from '../model/publication-view';
import { CancelPublicationDialog } from './CancelPublicationDialog';
import { copy } from './copy';
import styles from './PublicationDrawer.module.css';
import { PublicationPipeline } from './PublicationPipeline';
import { RescheduleDialog } from './RescheduleDialog';

type Props = {
  /** The publication to show; null keeps the drawer closed. */
  publicationId: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** The list row, shown instantly while the detail loads (actions stay off until the server copy arrives). */
  placeholder?: PublicationDto | undefined;
  postTitle?: string | undefined;
  destinationTitle?: string | undefined;
  /** Telegram chat id of the destination: builds the link to the sent message. */
  chatId?: string | undefined;
  /** Detail poll interval; defaults to the feature's 15 s. */
  pollMs?: number | undefined;
};

// Sent, failed and cancelled publications have nothing to do from here, so they get no empty footer bar.
function hasFooter(publication: PublicationDto): boolean {
  const actions = publicationActions(publication.status);
  return (
    actions.needsReconciliation ||
    actions.canCancel ||
    actions.canReschedule ||
    publication.status === 'preparing' ||
    publication.status === 'sending'
  );
}

type OpenDialog = 'reschedule' | 'cancel' | null;

export function PublicationDrawer({
  publicationId,
  isOpen,
  onOpenChange,
  placeholder,
  postTitle,
  destinationTitle,
  chatId,
  pollMs = PUBLICATION_POLL_MS
}: Props) {
  const query = useQuery({
    ...publicationQueryOptions(publicationId ?? '', pollMs),
    enabled: isOpen && publicationId !== null,
    placeholderData: placeholder
  });
  const publication = query.data;
  const shown = publication ? displayStatus(publication) : undefined;
  const title = postTitle ?? copy.drawer.titleFallback;
  const [dialog, setDialog] = useState<OpenDialog>(null);

  return (
    <>
      <Drawer
        isOpen={isOpen && publicationId !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
          onOpenChange(open);
        }}
        title={title}
        meta={shown ? <StatusBadge status={shown} /> : undefined}
        footer={
          publication && hasFooter(publication) ? (
            <DrawerActions publication={publication} isFresh={!query.isPlaceholderData} onOpenDialog={setDialog} />
          ) : undefined
        }
      >
        {publication ? (
          <PublicationBody
            publication={publication}
            postTitle={postTitle}
            destinationTitle={destinationTitle}
            chatId={chatId}
          />
        ) : query.isError ? (
          <DetailError error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <div className={styles.loading} aria-busy="true">
            <Skeleton height={28} />
            <Skeleton lines={4} height={16} />
            <Skeleton height={120} radius="var(--radius-2)" />
          </div>
        )}
      </Drawer>
      {/* Stacked above the drawer, outside its footer, so a status change that removes the buttons cannot unmount a dialog that is showing the explanation. */}
      {publication && dialog === 'reschedule' ? (
        <RescheduleDialog publication={publication} onOpenChange={(open) => setDialog(open ? 'reschedule' : null)} />
      ) : null}
      {publication && dialog === 'cancel' ? (
        <CancelPublicationDialog
          publication={publication}
          postTitle={title}
          onOpenChange={(open) => setDialog(open ? 'cancel' : null)}
        />
      ) : null}
    </>
  );
}

function DetailError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  if (classifyApiError(error) === 'not_found') {
    return <ErrorState title={copy.errors.notFoundDetail.title} message={copy.errors.notFoundDetail.body} />;
  }
  return (
    <ErrorState
      title={copy.drawer.loadError}
      message={copy.states.errorMessage}
      {...(requestId ? { requestId } : {})}
      onRetry={onRetry}
    />
  );
}

type BodyProps = {
  publication: PublicationDto;
  postTitle: string | undefined;
  destinationTitle: string | undefined;
  chatId: string | undefined;
};

function PublicationBody({ publication, postTitle, destinationTitle, chatId }: BodyProps) {
  const zone = useMemo(() => browserTimeZone(), []);
  const shown = displayStatus(publication);
  const confirmedId = shown === 'sent' ? publication.externalMessageId : undefined;
  const href = confirmedId && chatId ? messageLink(chatId, confirmedId) : undefined;
  const timeline = buildTimeline(publication, zone);
  const sameZone = zone === publication.timezone;

  return (
    <>
      <StatusNotice publication={publication} />
      <section className={styles.section} aria-label={copy.drawer.pipeline}>
        <PublicationPipeline status={shown} />
      </section>

      <section className={styles.section} aria-labelledby="pub-details">
        <h3 id="pub-details" className={styles.heading}>
          {copy.drawer.details}
        </h3>
        <dl className={styles.details}>
          <dt>{copy.drawer.post}</dt>
          <dd>
            <Link to="/posts/$id" params={{ id: publication.postId }} className={styles.link}>
              {postTitle ?? copy.drawer.openPost}
            </Link>
            <span className={styles.muted}> · {copy.drawer.revision(publication.postRevision)}</span>
          </dd>
          <dt>{copy.drawer.channel}</dt>
          <dd>{destinationTitle ?? copy.list.unknownChannel}</dd>
          <dt>{copy.drawer.scheduledAt}</dt>
          <dd>
            {formatLong(publication.scheduledAt, publication.timezone)}
            <span className={`${styles.muted} mono`}>
              {' '}
              {publication.timezone} ({utcOffsetLabel(new Date(publication.scheduledAt), publication.timezone)})
            </span>
          </dd>
          {sameZone ? null : (
            <>
              <dt>{copy.drawer.yourZone}</dt>
              <dd className="mono">{formatWithZone(publication.scheduledAt, zone)}</dd>
            </>
          )}
          <dt>{copy.drawer.utc}</dt>
          <dd className="mono">{formatUtc(publication.scheduledAt)}</dd>
          <dt>{copy.drawer.message}</dt>
          <dd>
            {confirmedId ? (
              href ? (
                <a className={styles.link} href={href} target="_blank" rel="noopener noreferrer">
                  {copy.drawer.openInTelegram}
                  <span className="mono"> · № {confirmedId}</span>
                </a>
              ) : (
                <span className="mono">№ {confirmedId}</span>
              )
            ) : (
              <span className={styles.muted}>{copy.drawer.messageNone}</span>
            )}
          </dd>
          {publication.lastErrorCode ? (
            <>
              <dt>{copy.drawer.errorCode}</dt>
              <dd className="mono">{publication.lastErrorCode}</dd>
            </>
          ) : null}
          <dt>{copy.drawer.publicationId}</dt>
          <dd className={`mono ${styles.id}`}>{publication.id}</dd>
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="pub-timeline">
        <h3 id="pub-timeline" className={styles.heading}>
          {copy.drawer.attempts}
        </h3>
        <p className={styles.note}>
          {copy.drawer.timelineZone(zone, utcOffsetLabel(new Date(publication.updatedAt), zone))}
        </p>
        <Timeline aria-label={copy.drawer.attempts} items={timeline} />
        <p className={styles.note}>{copy.drawer.attemptsNote}</p>
      </section>
    </>
  );
}

/** The one block that explains the current state when it needs a decision or an explanation. */
function StatusNotice({ publication }: { publication: PublicationDto }) {
  const reason = publication.lastErrorCode ? explainErrorCode(publication.lastErrorCode) : undefined;
  if (publication.status === 'unknown') {
    return (
      <Banner tone="warning" title={copy.drawer.unknownTitle}>
        <p className={styles.noticeText}>{copy.drawer.unknownBody}</p>
        {reason ? <p className={styles.noticeText}>{reason}</p> : null}
        <p className={styles.noticeStrong}>{copy.drawer.unknownStepsLabel}</p>
        <ol className={styles.steps}>
          <li>{copy.drawer.unknownStep1}</li>
          <li>{copy.drawer.unknownStep2}</li>
        </ol>
      </Banner>
    );
  }
  if (publication.status === 'sent' && !publication.externalMessageId) {
    return (
      <Banner tone="warning" title={copy.drawer.sentWithoutId.title}>
        {copy.drawer.sentWithoutId.body}
      </Banner>
    );
  }
  if (publication.status === 'failed') {
    return (
      <Banner tone="error" title={copy.drawer.failedTitle}>
        <p className={styles.noticeText}>{copy.drawer.failedBody}</p>
        {reason ? <p className={styles.noticeText}>{reason}</p> : null}
      </Banner>
    );
  }
  if (publication.status === 'retry_wait') {
    return (
      <Banner tone="info" title={copy.drawer.retryTitle}>
        <p className={styles.noticeText}>{copy.drawer.retryBody}</p>
        {reason ? <p className={styles.noticeText}>{reason}</p> : null}
      </Banner>
    );
  }
  return null;
}

type ActionsProps = {
  publication: PublicationDto;
  isFresh: boolean;
  onOpenDialog: (dialog: 'reschedule' | 'cancel') => void;
};

function DrawerActions({ publication, isFresh, onOpenDialog }: ActionsProps) {
  const actions = publicationActions(publication.status);

  if (actions.needsReconciliation) {
    return (
      <div className={styles.actions}>
        <Tooltip content={copy.drawer.reconcileHint}>
          <Button variant="secondary" icon="check-circle" isDisabled>
            {copy.drawer.reconcile}
          </Button>
        </Tooltip>
        <p className={styles.hint}>{copy.drawer.reconcileHint}</p>
      </div>
    );
  }
  if (!actions.canReschedule && !actions.canCancel) {
    return <p className={styles.hint}>{copy.drawer.cancelBlockedHint}</p>;
  }
  return (
    <div className={styles.actions}>
      {actions.canReschedule ? (
        <Button variant="secondary" icon="calendar" isDisabled={!isFresh} onPress={() => onOpenDialog('reschedule')}>
          {copy.drawer.reschedule}
        </Button>
      ) : null}
      {actions.canCancel ? (
        <Button variant="danger" icon="x-circle" isDisabled={!isFresh} onPress={() => onOpenDialog('cancel')}>
          {copy.drawer.cancel}
        </Button>
      ) : null}
    </div>
  );
}
