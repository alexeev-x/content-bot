import type { PublicationDto, ResolveUnknownOutcome } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { classifyApiError } from '../../../shared/api/error-kind';
import {
  Banner,
  Button,
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
import { browserTimeZone, formatLong, formatUtc, formatWithZone, utcOffsetLabel } from '../model/format-time';
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
            postBody={postBody}
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
      {publication && dialog?.startsWith('resolve-') ? (
        <ResolveUnknownDialog
          outcome={dialog.slice('resolve-'.length) as ResolveUnknownOutcome}
          publication={publication}
          chatId={chatId}
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
};

function PublicationBody({ publication, postTitle, postBody, destinationTitle, chatId }: BodyProps) {
  const zone = useMemo(() => browserTimeZone(), []);
  const shown = displayStatus(publication);
  const confirmedId = shown === 'sent' ? publication.externalMessageId : undefined;
  const href = confirmedId && chatId ? messageLink(chatId, confirmedId) : undefined;
  const timeline = buildTimeline(publication, zone);
  const sameZone = zone === publication.timezone;

  return (
    <>
      <StatusNotice publication={publication} chatId={chatId} />

      <section className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden="true">
          <span>А</span>
        </div>
        <div className={styles.heroText}>
          <strong>{postTitle ?? copy.drawer.openPost}</strong>
          <span>{postBody || 'Без текста'}</span>
        </div>
      </section>

      <div className={styles.quickActions}>
        <Link to="/posts/$id" params={{ id: publication.postId }} className={styles.secondaryAction}>
          Редактировать
        </Link>
        {href ? (
          <a className={styles.primaryAction} href={href} target="_blank" rel="noopener noreferrer">
            Открыть в Telegram
          </a>
        ) : null}
      </div>

      <section className={styles.section} aria-label={copy.drawer.pipeline}>
        <PublicationPipeline status={shown} />
      </section>

      <Tabs defaultSelectedKey="content">
        <TabList aria-label="Раздел публикации">
          <Tab id="content">Контент</Tab>
          <Tab id="stats">Статистика</Tab>
          <Tab id="logs">Логи</Tab>
        </TabList>

        <TabPanel id="content">
          <div className={styles.tabContent}>
            <section className={styles.section} aria-labelledby="pub-text">
              <h3 id="pub-text" className={styles.heading}>
                Текст
              </h3>
              <p className={styles.postBody}>{postBody || 'Текст поста недоступен.'}</p>
            </section>

            <section className={styles.section} aria-labelledby="pub-details">
              <h3 id="pub-details" className={styles.heading}>
                {copy.drawer.details}
              </h3>
              <dl className={styles.details}>
                <dt>{'Статус'}</dt>
                <dd>
                  <StatusBadge status={shown} />
                </dd>
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
                  <span className={styles.muted}>
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
                        Сообщение <span className="mono">№ {confirmedId}</span>
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
              </dl>
            </section>
          </div>
        </TabPanel>

        <TabPanel id="stats">
          <div className={styles.futurePanel}>
            <strong>Статистика публикации</strong>
            <p>Появится после подключения Telegram Analytics. Сейчас сервер не хранит метрики просмотров и вовлечённости.</p>
          </div>
        </TabPanel>

        <TabPanel id="logs">
          <div className={styles.tabContent}>
            <p className={styles.note}>
              {copy.drawer.timelineZone(zone, utcOffsetLabel(new Date(publication.updatedAt), zone))}
            </p>
            <Timeline aria-label={copy.drawer.attempts} items={timeline} />
            <p className={styles.note}>{copy.drawer.attemptsNote}</p>
            <p className={styles.idLine}>
              <span>Publication ID</span>
              <code>{publication.id}</code>
            </p>
          </div>
        </TabPanel>
      </Tabs>
    </>
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
};

function DrawerActions({ publication, isFresh, onOpenDialog }: ActionsProps) {
  const actions = publicationActions(publication.status);

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
