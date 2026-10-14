import type { PublicationDto, ResolveUnknownOutcome } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { classifyApiError } from '../../../shared/api/error-kind';
import {
  Banner,
  Button,
  Disclosure,
  Drawer,
  ErrorState,
  Skeleton,
  StatusBadge,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Timeline,
  VisuallyHidden
} from '../../../shared/ui';
import { PUBLICATION_POLL_MS, publicationQueryOptions } from '../api/publications-queries';
import { browserTimeZone, formatLong } from '../model/format-time';
import { publicationActions } from '../model/publication-actions';
import { explainErrorCode } from '../model/publication-errors';
import { buildTimeline } from '../model/publication-timeline';
import { channelLink, displayStatus, messageLink } from '../model/publication-view';
import { CancelPublicationDialog } from './CancelPublicationDialog';
import { copy } from './copy';
import styles from './PublicationDrawer.module.css';
import { PublicationPipeline } from './PublicationPipeline';
import { RescheduleDialog } from './RescheduleDialog';
import { ResolveUnknownDialog } from './ResolveUnknownDialog';

type Props = {
  /** The publication to show; null keeps the drawer closed. */
  publicationId: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** The list row, shown instantly while the detail loads (actions stay off until the server copy arrives). */
  placeholder?: PublicationDto | undefined;
  postTitle?: string | undefined;
  postBody?: string | undefined;
  destinationTitle?: string | undefined;
  /** Telegram chat id of the destination: builds the link to the sent message. */
  chatId?: string | undefined;
  /** Detail poll interval; defaults to the feature's 15 s. */
  pollMs?: number | undefined;
  timezone?: string | undefined;
  onDelete?: (publication: PublicationDto) => void;
  /** «Отправить снова» for a failed publication: a new publish attempt, never a retry of the old request. */
  onResend?: (publication: PublicationDto) => void;
};

// Sent, failed and cancelled publications have nothing to do from here, so they get no empty footer bar.
function hasFooter(publication: PublicationDto): boolean {
  const actions = publicationActions(publication.status);
  return (
    actions.needsReconciliation ||
    actions.canCancel ||
    actions.canReschedule ||
    publication.status === 'preparing' ||
    publication.status === 'sending' ||
    publication.status === 'sent' ||
    publication.status === 'failed' ||
    publication.status === 'cancelled'
  );
}

type OpenDialog = 'reschedule' | 'cancel' | `resolve-${ResolveUnknownOutcome}` | null;

export function PublicationDrawer({
  publicationId,
  isOpen,
  onOpenChange,
  placeholder,
  postTitle,
  postBody,
  destinationTitle,
  chatId,
  onDelete,
  onResend,
  pollMs = PUBLICATION_POLL_MS,
  timezone
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
  const zone = timezone ?? browserTimeZone();

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
            <DrawerActions
              publication={publication}
              isFresh={!query.isPlaceholderData}
              onOpenDialog={setDialog}
              onDelete={onDelete}
              onResend={onResend}
            />
          ) : undefined
        }
      >
        {publication ? (
          <PublicationBody
            publication={publication}
            postTitle={postTitle}
            postBody={postBody}
            destinationTitle={destinationTitle}
            chatId={chatId}
            timezone={zone}
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
        <RescheduleDialog
          publication={publication}
          timezone={zone}
          onOpenChange={(open) => setDialog(open ? 'reschedule' : null)}
        />
      ) : null}
      {publication && dialog?.startsWith('resolve-') ? (
        <ResolveUnknownDialog
          outcome={dialog.slice('resolve-'.length) as ResolveUnknownOutcome}
          publication={publication}
          chatId={chatId}
          timezone={zone}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
        />
      ) : null}
      {publication && dialog === 'cancel' ? (
        <CancelPublicationDialog
          publication={publication}
          postTitle={title}
          destinationTitle={destinationTitle}
          timezone={zone}
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
  postBody: string | undefined;
  destinationTitle: string | undefined;
  chatId: string | undefined;
  timezone: string;
};

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function PublicationBody({ publication, postTitle, postBody, destinationTitle, chatId, timezone }: BodyProps) {
  const zone = timezone;
  const shown = displayStatus(publication);
  // A message link and number exist only for a publication the server confirmed as sent with an id.
  const confirmedId = shown === 'sent' ? publication.externalMessageId : undefined;
  const href = confirmedId && chatId ? messageLink(chatId, confirmedId) : undefined;
  const timeline = buildTimeline(publication, zone);
  const log = (
    <div className={styles.tabContent}>
      <Timeline aria-label={copy.drawer.attempts} items={timeline} />
      <p className={styles.note}>{copy.drawer.attemptsNote}</p>
    </div>
  );

  return (
    <div className={styles.stack}>
      <StatusNotice publication={publication} chatId={chatId} />

      <section className={styles.section} aria-label={copy.drawer.pipeline}>
        <PublicationPipeline status={shown} />
      </section>

      <dl className={styles.facts}>
        <Fact term={copy.drawer.channel}>{destinationTitle ?? copy.list.unknownChannel}</Fact>
        <Fact term={copy.drawer.time}>{formatLong(publication.scheduledAt, zone)}</Fact>
        <Fact term={copy.drawer.post}>
          {publication.postDeleted === true ? (
            <span>
              {postTitle ?? copy.drawer.titleFallback} <span className={styles.muted}>({copy.drawer.postDeleted})</span>
            </span>
          ) : (
            <Link to="/posts/$id" params={{ id: publication.postId }} className={styles.link}>
              {postTitle ?? copy.drawer.openPost}
            </Link>
          )}
        </Fact>
        {confirmedId ? (
          <Fact term={copy.drawer.message}>
            {href ? (
              <a className={styles.link} href={href} target="_blank" rel="noopener noreferrer">
                {copy.drawer.openInTelegram} <span className="mono">(№ {confirmedId})</span>
              </a>
            ) : (
              <span className="mono">№ {confirmedId}</span>
            )}
          </Fact>
        ) : null}
      </dl>

      {postBody ? (
        <Tabs defaultSelectedKey="text">
          <TabList aria-label={copy.drawer.sectionLabel}>
            <Tab id="text">{copy.drawer.textTab}</Tab>
            <Tab id="log">{copy.drawer.attempts}</Tab>
          </TabList>
          <TabPanel id="text">
            <p className={styles.postBody}>{postBody}</p>
          </TabPanel>
          <TabPanel id="log">{log}</TabPanel>
        </Tabs>
      ) : (
        <section className={styles.section} aria-labelledby="pub-log">
          <h3 id="pub-log" className={styles.heading}>
            {copy.drawer.attempts}
          </h3>
          {log}
        </section>
      )}

      <Disclosure id="tech" title={copy.drawer.techTitle}>
        <dl className={styles.facts}>
          <Fact term={copy.drawer.publicationId}>
            <code className={styles.code}>{publication.id}</code>
          </Fact>
          {publication.lastErrorCode ? (
            <Fact term={copy.drawer.errorCode}>
              <code className={styles.code}>{publication.lastErrorCode}</code>
            </Fact>
          ) : null}
        </dl>
      </Disclosure>
    </div>
  );
}

/** The one block that explains the current state when it needs a decision or an explanation. */
function StatusNotice({ publication, chatId }: { publication: PublicationDto; chatId: string | undefined }) {
  const reason = publication.lastErrorCode ? explainErrorCode(publication.lastErrorCode) : undefined;
  if (publication.status === 'unknown') {
    const channelHref = chatId ? channelLink(chatId) : undefined;
    return (
      <Banner tone="warning" title={copy.resolve.explainTitle}>
        <p className={styles.noticeText}>{copy.resolve.explain}</p>
        {reason ? <p className={styles.noticeText}>{reason}</p> : null}
        {channelHref ? (
          <a className={styles.link} href={channelHref} target="_blank" rel="noopener noreferrer">
            {copy.resolve.openChannel}
          </a>
        ) : null}
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
  onOpenDialog: (dialog: Exclude<OpenDialog, null>) => void;
  onDelete?: (publication: PublicationDto) => void;
  onResend?: ((publication: PublicationDto) => void) | undefined;
};

function DrawerActions({ publication, isFresh, onOpenDialog, onDelete, onResend }: ActionsProps) {
  const actions = publicationActions(publication.status);

  if (publication.status === 'sent' || publication.status === 'failed' || publication.status === 'cancelled') {
    return (
      <div className={styles.actions}>
        {publication.status === 'failed' && onResend ? (
          <Button variant="secondary" icon="retry" isDisabled={!isFresh} onPress={() => onResend(publication)}>
            {copy.drawer.resend}
          </Button>
        ) : null}
        <Button
          variant="danger"
          icon="trash"
          isDisabled={!isFresh || !onDelete}
          onPress={() => onDelete?.(publication)}
        >
          {copy.deletion.delete}
        </Button>
      </div>
    );
  }

  if (actions.needsReconciliation) {
    return (
      <fieldset className={`${styles.actions} ${styles.choices}`}>
        <legend>
          <VisuallyHidden>{copy.resolve.choicesLabel}</VisuallyHidden>
        </legend>
        <Button
          variant="secondary"
          icon="check-circle"
          isDisabled={!isFresh}
          onPress={() => onOpenDialog('resolve-sent')}
        >
          {copy.resolve.choiceSent}
        </Button>
        <Button variant="secondary" icon="send" isDisabled={!isFresh} onPress={() => onOpenDialog('resolve-resend')}>
          {copy.resolve.choiceResend}
        </Button>
        <Button variant="danger" icon="x-circle" isDisabled={!isFresh} onPress={() => onOpenDialog('resolve-cancel')}>
          {copy.resolve.choiceCancel}
        </Button>
      </fieldset>
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
