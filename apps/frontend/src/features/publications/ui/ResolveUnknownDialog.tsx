import type { PublicationDto, ResolveUnknownOutcome } from '@alexeev/contracts';
import { now, type ZonedDateTime } from '@internationalized/date';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { ru } from '../../../shared/lib/ru';
import { Button, DateTimeField, Dialog, TextArea, useToast } from '../../../shared/ui';
import type { ResolveUnknownBody } from '../api/publications-api';
import { publicationKeys, useResolveUnknownPublication } from '../api/publications-queries';
import { browserTimeZone, formatWithZone } from '../model/format-time';
import { parseMessageRef } from '../model/message-ref';
import { isConfirmedSent } from '../model/publication-actions';
import { describeActionError, isTerminalForAction, type ActionError } from '../model/publication-errors';
import { MAX_DAYS_AHEAD } from '../model/publish-form';
import { displayStatus } from '../model/publication-view';
import { ActionErrorBanner } from './ActionErrorBanner';
import { copy } from './copy';
import styles from './ResolveUnknownDialog.module.css';

type Props = {
  outcome: ResolveUnknownOutcome;
  publication: PublicationDto;
  /** Telegram chat id of the destination: lets the link check refuse a message from another channel. */
  chatId?: string | undefined;
  onOpenChange: (open: boolean) => void;
};

const DAY_MS = 86_400_000;
// The server treats a time up to 5 minutes back as «send now»; the default «now» must stay inside that window.
const PAST_TOLERANCE_MS = 4 * 60_000;
const text = copy.resolve;

const currentTime = () => new Date();

function validateTime(value: ZonedDateTime | null): string | undefined {
  if (value === null) return text.resend.needTime;
  const at = value.toDate().getTime();
  if (at < Date.now() - PAST_TOLERANCE_MS) return text.resend.timeInPast;
  if (at > Date.now() + MAX_DAYS_AHEAD * DAY_MS) return text.resend.timeTooFar;
  return undefined;
}

function toastFor(updated: PublicationDto, zone: string): { title: string; description: string } {
  if (isConfirmedSent(updated) && updated.externalMessageId) {
    return { title: text.toastSent, description: text.sent.toastBody(updated.externalMessageId) };
  }
  if (updated.status === 'scheduled') {
    return { title: ru.status.scheduled, description: text.toastScheduled(formatWithZone(updated.scheduledAt, zone)) };
  }
  if (updated.status === 'queued') return { title: ru.status.queued, description: text.toastQueued };
  if (updated.status === 'cancelled') return { title: ru.status.cancelled, description: text.toastCancelled };
  // Anything else is shown as the server returned it, never as a success.
  return { title: ru.status[displayStatus(updated)], description: text.toastOther };
}

/** One confirm dialog per outcome of the manual reconciliation. Mounted only while open, so typed input survives errors. */
export function ResolveUnknownDialog({ outcome, publication, chatId, onOpenChange }: Props) {
  const formId = useId();
  const zone = useMemo(() => browserTimeZone(), []);
  const toast = useToast();
  const queryClient = useQueryClient();
  const resolve = useResolveUnknownPublication();
  const [link, setLink] = useState('');
  const [when, setWhen] = useState<ZonedDateTime | null>(() => now(zone));
  const [touched, setTouched] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [failure, setFailure] = useState<ActionError | null>(null);
  const isUnknown = publication.status === 'unknown';
  const parsedRefs = link
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => parseMessageRef(value, chatId));

  function linkProblem(): string | undefined {
    if (parsedRefs.length === 0) return text.sent.needValue;
    if (parsedRefs.length > 10) return 'Можно указать не более 10 сообщений одной альбомной публикации.';
    const invalid = parsedRefs.find((item) => !item.ok);
    if (!invalid) return undefined;
    return invalid.reason === 'channel' ? text.sent.wrongChannel : text.sent.badFormat;
  }

  function buildInput(): ResolveUnknownBody | null {
    const revision = publication.revision;
    if (outcome === 'cancel') return { outcome, revision };
    if (outcome === 'sent') {
      const problem = linkProblem();
      setFieldError(problem);
      if (problem) return null;
      const ids = parsedRefs.flatMap((item) => (item.ok ? [item.id] : []));
      if (new Set(ids).size !== ids.length) {
        setFieldError('Идентификаторы сообщений должны быть разными.');
        return null;
      }
      return ids.length === 1
        ? { outcome, revision, externalMessageId: ids[0] }
        : { outcome, revision, externalMessageIds: ids };
    }
    const problem = touched ? validateTime(when) : undefined;
    setFieldError(problem);
    if (problem) return null;
    // An untouched default means «now»: take the clock at the press, not at the time the dialog opened.
    const at = touched && when ? when.toDate() : currentTime();
    return { outcome, revision, scheduledAt: at.toISOString(), timezone: zone };
  }

  async function submit() {
    if (resolve.isPending || !isUnknown) return;
    const input = buildInput();
    if (input === null) return;
    setFailure(null);
    try {
      const updated = await resolve.mutateAsync({ id: publication.id, input });
      toast.show({ tone: 'success', ...toastFor(updated, zone) });
      onOpenChange(false);
    } catch (error) {
      const described = describeActionError(error, 'resolve');
      if (described.kind === 'schedule_out_of_range' && outcome === 'resend') setFieldError(described.body);
      else setFailure(described);
      // The server's truth replaces the stale copy; what the owner typed stays in the field.
      if (described.kind === 'stale_revision' || isTerminalForAction(described.kind)) {
        void queryClient.invalidateQueries({ queryKey: publicationKeys.detail(publication.id) });
        void queryClient.invalidateQueries({ queryKey: publicationKeys.lists() });
      }
    }
  }

  // A press of Esc or the backdrop while the request is in flight would hide its result.
  const handleOpenChange = (open: boolean) => {
    if (!open && resolve.isPending) return;
    onOpenChange(open);
  };

  const blocked: ActionError | null = isUnknown
    ? null
    : {
        kind: 'not_unknown',
        tone: 'conflict',
        title: copy.errors.notUnknown.title,
        body: `${copy.errors.notUnknown.body} ${text.currentStatus}: ${ru.status[displayStatus(publication)]}.`
      };
  const shownFailure = blocked ?? failure;
  const banner = shownFailure ? <ActionErrorBanner error={shownFailure} /> : null;

  const summary = (body: string) => (
    <section className={styles.summary} aria-label={text.summaryTitle}>
      <h3 className={styles.summaryTitle}>{text.summaryTitle}</h3>
      <p className={styles.summaryText}>{body}</p>
    </section>
  );

  if (outcome === 'cancel') {
    return (
      <Dialog
        isOpen
        onOpenChange={handleOpenChange}
        role="alertdialog"
        title={text.cancel.title}
        description={text.cancel.description}
        footer={
          <>
            {/* Intentional: the safe answer takes initial focus in a destructive confirmation (skill ui-patterns). */}
            {/* oxlint-disable-next-line jsx-a11y/no-autofocus */}
            <Button variant="secondary" autoFocus isDisabled={resolve.isPending} onPress={() => onOpenChange(false)}>
              {text.cancel.keep}
            </Button>
            <Button
              variant="danger"
              isLoading={resolve.isPending}
              isDisabled={!isUnknown}
              onPress={() => void submit()}
            >
              {text.cancel.submit}
            </Button>
          </>
        }
      >
        <div className={styles.form}>
          {banner}
          {summary(text.cancel.summary)}
        </div>
      </Dialog>
    );
  }

  const isSent = outcome === 'sent';
  const copyFor = isSent ? text.sent : text.resend;
  return (
    <Dialog
      isOpen
      onOpenChange={handleOpenChange}
      title={copyFor.title}
      description={copyFor.description}
      footer={
        <>
          <Button variant="ghost" isDisabled={resolve.isPending} onPress={() => onOpenChange(false)}>
            {text.keep}
          </Button>
          <Button
            type="submit"
            form={formId}
            icon={isSent ? 'check-circle' : 'send'}
            isLoading={resolve.isPending}
            isDisabled={!isUnknown}
          >
            {copyFor.submit}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {banner}
        {isSent ? (
          <TextArea
            label={text.sent.field}
            description={`${text.sent.hint}. Для альбома укажите все ссылки или ID, по одному на строку (до 10).`}
            placeholder={text.sent.placeholder}
            value={link}
            onChange={(next) => {
              setLink(next);
              if (fieldError) setFieldError(undefined);
            }}
            isRequired
            isDisabled={!isUnknown}
            autoComplete="off"
            rows={3}
            {...(fieldError ? { errorMessage: fieldError } : {})}
          />
        ) : (
          <DateTimeField
            label={text.resend.field}
            description={touched ? undefined : text.resend.nowHint}
            value={when}
            onChange={(next) => {
              setWhen(next);
              setTouched(true);
              if (fieldError) setFieldError(validateTime(next));
            }}
            timeZone={zone}
            isRequired
            isDisabled={!isUnknown}
            {...(fieldError ? { errorMessage: fieldError } : {})}
          />
        )}
        {isSent
          ? summary(
              parsedRefs.length === 1 && parsedRefs[0]?.ok
                ? text.sent.summary(parsedRefs[0].id)
                : parsedRefs.length > 1
                  ? `Будут записаны ${parsedRefs.length} ID сообщений альбома. Повторной отправки не будет.`
                  : text.sent.summaryEmpty
            )
          : summary(text.resend.summary(touched && when ? formatWithZone(when.toDate().toISOString(), zone) : null))}
      </form>
    </Dialog>
  );
}
