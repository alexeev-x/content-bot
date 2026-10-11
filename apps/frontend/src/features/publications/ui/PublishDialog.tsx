import type { DestinationDto, PostDto, PublicationDto } from '@alexeev/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { now, parseAbsolute, type ZonedDateTime } from '@internationalized/date';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, type LinkProps } from '@tanstack/react-router';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { ru } from '../../../shared/lib/ru';
import {
  Banner,
  Button,
  ConfirmDialog,
  DateTimeField,
  Dialog,
  Select,
  SegmentedControl,
  Skeleton,
  TelegramPreview,
  useToast
} from '../../../shared/ui';
import {
  publicationsPageQueryOptions,
  publishDestinationsQueryOptions,
  useSubmitPublication
} from '../api/publications-queries';
import { browserTimeZone, formatShort, formatWithZone } from '../model/format-time';
import { describeActionError, type ActionError } from '../model/publication-errors';
import { defaultScheduledAt, publishFormSchema, type PublishFormValues } from '../model/publish-form';
import {
  clearIntent,
  createIntentMemory,
  findIntent,
  INTENT_TRUSTED_MS,
  isDefinitive,
  newIntent,
  saveIntent,
  type PublishIntent
} from '../model/publish-intent';
import { displayStatus } from '../model/publication-view';
import { copy } from './copy';
import styles from './PublishDialog.module.css';

type Props = {
  post: PostDto;
  timezone?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onPublished?: (publication: PublicationDto) => void;
  initialSettings?: { destinationId: string; mode: 'now' | 'later'; scheduledAt: ZonedDateTime };
  lockSettings?: boolean;
};

const CHANNELS_PATH = '/settings/channels' as LinkProps['to'];
const PUBLICATIONS_PATH = '/publications' as LinkProps['to'];
const MODES = [
  { id: 'now', label: copy.publish.now, icon: 'send' },
  { id: 'later', label: copy.publish.later, icon: 'calendar' }
] as const;

/** Publish dialog: the post is mounted per id, so what the owner picked survives closing and reopening it. */
export function PublishDialog(props: Props) {
  const key = `${props.post.id}:${props.timezone ?? ''}:${props.initialSettings?.destinationId ?? ''}:${props.initialSettings?.mode ?? ''}:${props.initialSettings?.scheduledAt.toDate().toISOString() ?? ''}`;
  return <PublishDialogBody key={key} {...props} />;
}

function PublishDialogBody({
  post,
  timezone: configuredTimezone,
  isOpen,
  onOpenChange,
  onPublished,
  initialSettings,
  lockSettings = false
}: Props) {
  const formId = useId();
  const zone = configuredTimezone ?? browserTimeZone();
  const toast = useToast();
  const queryClient = useQueryClient();
  const create = useSubmitPublication();
  const destinations = useQuery({ ...publishDestinationsQueryOptions(), enabled: isOpen });
  const [failure, setFailure] = useState<{ error: ActionError; revision: number } | null>(null);
  const openRef = useRef(isOpen);
  useEffect(() => {
    openRef.current = isOpen;
  }, [isOpen]);
  const [duplicate, setDuplicate] = useState<PublishFormValues | null>(null);
  const [confirmation, setConfirmation] = useState<PublishIntent | null>(null);
  const appliedKey = useRef<string | null>(null);
  const [memory] = useState(createIntentMemory);
  const [staleIntent, setStaleIntent] = useState<PublishIntent | null>(null);

  const form = useForm<PublishFormValues>({
    resolver: zodResolver(publishFormSchema),
    defaultValues: {
      destinationId: initialSettings?.destinationId ?? '',
      mode: initialSettings?.mode ?? 'now',
      scheduledAt: initialSettings?.scheduledAt ?? defaultScheduledAt(zone)
    }
  });
  const values = useWatch({ control: form.control });
  const mode = values.mode ?? 'now';
  // useWatch deep-partials class instances (ZonedDateTime), which hides their methods: the form value is the whole object.
  const scheduledAt = values.scheduledAt as ZonedDateTime | null | undefined;
  const options = destinations.data?.items ?? [];

  const onlyDestination = options.length === 1 ? options[0]?.id : undefined;
  useEffect(() => {
    if (onlyDestination !== undefined && form.getValues('destinationId') === '') {
      form.setValue('destinationId', onlyDestination);
    }
  }, [onlyDestination, form]);

  // A request that may have reached the server is retried exactly as sent (same key, same instant), whatever the delay.
  const pending = findIntent(memory, post.id, post.revision, values.destinationId || undefined);
  useEffect(() => {
    // Switching away drops the pending intent from view; coming back re-applies its mode and time.
    if (!pending) {
      appliedKey.current = null;
      return;
    }
    if (appliedKey.current === pending.key) return;
    appliedKey.current = pending.key;
    form.setValue('destinationId', pending.destinationId);
    form.setValue('mode', pending.mode);
    if (pending.mode === 'later') form.setValue('scheduledAt', parseAbsolute(pending.scheduledAt, zone));
  }, [pending, form, zone]);

  const selected: DestinationDto | undefined = options.find((item) => item.id === values.destinationId);
  const visibleFailure = failure && failure.revision === post.revision ? failure.error : null;
  const isApproved = post.status === 'approved';

  async function send(intent: PublishIntent) {
    if (create.isPending || !isApproved) return;
    setFailure(null);
    // Saved before the request: if the answer is lost, a remount or reload still finds the same intent.
    saveIntent(memory, intent);
    try {
      const created = await create.mutateAsync({
        input: {
          postId: intent.postId,
          revision: intent.revision,
          destinationId: intent.destinationId,
          scheduledAt: intent.scheduledAt,
          timezone: intent.timezone
        },
        key: intent.key
      });
      clearIntent(memory, intent);
      // 202 only means "accepted": the label is whatever status the server returned, never «Опубликовано» by default.
      const shown = displayStatus(created);
      toast.show({
        tone: shown === 'scheduled' || shown === 'queued' ? 'success' : 'info',
        title: ru.status[shown],
        description:
          intent.mode === 'later'
            ? copy.publish.toastBody(formatWithZone(created.scheduledAt, zone))
            : copy.publish.toastOther
      });
      onOpenChange(false);
      onPublished?.(created);
    } catch (error) {
      if (isDefinitive(error)) clearIntent(memory, intent);
      const described = describeActionError(error, 'create');
      setFailure({ error: described, revision: post.revision });
      // A closed dialog cannot show the banner: a failure must still reach the owner.
      if (!openRef.current) toast.show({ tone: 'error', title: described.title, description: described.body });
    }
  }

  async function start(formValues: PublishFormValues, skipDuplicateCheck: boolean) {
    if (create.isPending) return;
    if (!skipDuplicateCheck && (await hasPublication(formValues.destinationId)) === true) {
      setDuplicate(formValues);
      return;
    }
    const intent = newIntent({
      postId: post.id,
      revision: post.revision,
      destinationId: formValues.destinationId,
      mode: formValues.mode,
      scheduledAt:
        formValues.mode === 'later' && formValues.scheduledAt
          ? formValues.scheduledAt.toDate().toISOString()
          : undefined,
      timezone: zone
    });
    setConfirmation(intent);
  }

  // Second safety net: the same post already scheduled or published in this channel. `null` = the lookup failed.
  async function hasPublication(destinationId: string): Promise<boolean | null> {
    try {
      const page = await queryClient.fetchQuery({
        ...publicationsPageQueryOptions({ postId: post.id, destinationId }),
        staleTime: 0
      });
      return page.items.some((item) => item.status !== 'cancelled');
    } catch {
      return null;
    }
  }

  // An intent older than the server's 24 h key memory is no longer replay-protected: look before resending it.
  async function resendPending(intent: PublishIntent) {
    if (Date.now() - intent.createdAt < INTENT_TRUSTED_MS) {
      setConfirmation(intent);
      return;
    }
    const found = await hasPublication(intent.destinationId);
    if (found === null) {
      setFailure({
        error: { kind: 'unavailable', tone: 'warning', ...copy.errors.staleIntentCheckFailed },
        revision: post.revision
      });
    } else if (found) {
      setStaleIntent(intent);
    } else {
      setConfirmation(intent);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    // A pending intent is sent as it was, so it skips validation of a time that may have passed meanwhile.
    if (pending) {
      event.preventDefault();
      void resendPending(pending);
      return;
    }
    void form.handleSubmit((formValues) => start(formValues, false))(event);
  }

  const summaryWhen =
    mode === 'now'
      ? copy.publish.summaryNow
      : scheduledAt
        ? formatWithZone(scheduledAt.toDate().toISOString(), zone)
        : copy.publish.summaryNoTime;
  const errorMessages = Object.values(form.formState.errors)
    .map((item) => item?.message)
    .filter((message): message is string => typeof message === 'string');

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        title={copy.publish.title}
        description={copy.publish.description}
        footer={
          <>
            <Button variant="ghost" onPress={() => onOpenChange(false)}>
              {copy.publish.cancel}
            </Button>
            <Button
              type="submit"
              form={formId}
              icon={mode === 'now' ? 'send' : 'calendar'}
              isLoading={create.isPending}
              isDisabled={!isApproved || destinations.isPending || options.length === 0}
            >
              {mode === 'now' ? copy.publish.submitNow : copy.publish.submitLater}
            </Button>
          </>
        }
      >
        <form id={formId} className={styles.form} onSubmit={submit} noValidate>
          {!isApproved ? (
            <Banner tone="warning" title={copy.publish.notApprovedTitle}>
              {copy.publish.notApprovedBody}
            </Banner>
          ) : null}
          {pending ? (
            <Banner tone="warning" title={copy.publish.pendingTitle}>
              {copy.publish.pendingBody}
            </Banner>
          ) : null}
          {errorMessages.length > 0 ? (
            <Banner tone="error" title={copy.publish.errorsSummary}>
              <ul className={styles.issues}>
                {errorMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </Banner>
          ) : null}
          {visibleFailure ? (
            <Banner
              tone={visibleFailure.tone}
              title={visibleFailure.title}
              action={
                visibleFailure.kind === 'stale_revision' || visibleFailure.kind === 'post_archived' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="retry"
                    onPress={() => void queryClient.invalidateQueries({ queryKey: ['posts'] })}
                  >
                    {visibleFailure.kind === 'post_archived'
                      ? copy.errors.postArchived.action
                      : copy.errors.stale.action}
                  </Button>
                ) : visibleFailure.kind === 'unavailable' ? (
                  <Link to={PUBLICATIONS_PATH} className={styles.link}>
                    {copy.errors.unavailableCreate.action}
                  </Link>
                ) : undefined
              }
            >
              <p className={styles.errorBody}>{visibleFailure.body}</p>
              {visibleFailure.requestId ? (
                <p className={styles.request}>
                  {copy.errors.requestId}: <code>{visibleFailure.requestId}</code>
                </p>
              ) : null}
            </Banner>
          ) : null}

          <Channels
            isPending={destinations.isPending}
            isError={destinations.isError}
            onRetry={() => void destinations.refetch()}
            options={options}
            control={
              <Controller
                control={form.control}
                name="destinationId"
                render={({ field, fieldState }) => (
                  <Select
                    label={copy.publish.channel}
                    placeholder={copy.publish.channelPlaceholder}
                    options={options.map((item) => ({ id: item.id, label: item.title, description: item.chatId }))}
                    value={field.value || null}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    isRequired
                    isDisabled={lockSettings}
                    {...(fieldState.error?.message ? { errorMessage: fieldState.error.message } : {})}
                  />
                )}
              />
            }
          />

          <Controller
            control={form.control}
            name="mode"
            render={({ field }) => (
              <div className={styles.group}>
                <span className={styles.groupLabel}>{copy.publish.when}</span>
                <SegmentedControl
                  label={copy.publish.when}
                  options={MODES}
                  value={field.value}
                  onChange={(next) => field.onChange(next)}
                  isDisabled={Boolean(pending) || lockSettings}
                  fullWidth
                />
              </div>
            )}
          />

          {mode === 'later' ? (
            <Controller
              control={form.control}
              name="scheduledAt"
              render={({ field, fieldState }) => (
                <DateTimeField
                  label={copy.publish.scheduledAt}
                  value={field.value}
                  onChange={field.onChange}
                  timeZone={zone}
                  minValue={now(zone)}
                  isRequired
                  isDisabled={Boolean(pending) || lockSettings}
                  {...(fieldState.error?.message ? { errorMessage: fieldState.error.message } : {})}
                />
              )}
            />
          ) : null}

          <section className={styles.summary} aria-labelledby={`${formId}-summary`}>
            <h3 id={`${formId}-summary`} className={styles.summaryTitle}>
              {copy.publish.summaryTitle}
            </h3>
            <dl className={styles.list}>
              <dt>{copy.publish.summaryWhat}</dt>
              <dd>{post.title}</dd>
              <dt>{copy.publish.summaryWhere}</dt>
              <dd>{selected ? selected.title : copy.publish.summaryNoChannel}</dd>
              <dt>{copy.publish.summaryWhen}</dt>
              <dd>{summaryWhen}</dd>
            </dl>
          </section>

          <section className={styles.preview} aria-label={copy.publish.previewTitle}>
            <TelegramPreview
              title={post.title}
              body={post.body}
              meta={mode === 'later' && scheduledAt ? formatShort(scheduledAt.toDate().toISOString(), zone) : undefined}
            />
          </section>
        </form>
      </Dialog>
      <ConfirmDialog
        isOpen={duplicate !== null || staleIntent !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDuplicate(null);
            setStaleIntent(null);
          }
        }}
        title={copy.publish.duplicateTitle}
        description={copy.publish.duplicateBody}
        confirmLabel={copy.publish.duplicateConfirm}
        cancelLabel={copy.publish.duplicateKeep}
        isPending={create.isPending}
        onConfirm={() => {
          const chosen = duplicate;
          const old = staleIntent;
          setDuplicate(null);
          setStaleIntent(null);
          if (old) {
            setConfirmation(old);
          } else if (chosen) void start(chosen, true);
        }}
      />
      <ConfirmDialog
        isOpen={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        title="Подтвердить публикацию?"
        description={
          confirmation
            ? `${confirmation.mode === 'now' ? 'Пост будет поставлен в очередь сейчас' : 'Пост будет запланирован'} для канала ${options.find((item) => item.id === confirmation.destinationId)?.title ?? confirmation.destinationId}${confirmation.mode === 'later' ? ` на ${formatWithZone(confirmation.scheduledAt, confirmation.timezone)}` : ''}. Повторная отправка не выполняется автоматически.`
            : ''
        }
        confirmLabel={confirmation?.mode === 'later' ? 'Запланировать' : 'Поставить в очередь'}
        cancelLabel="Вернуться к настройкам"
        tone="default"
        isPending={create.isPending}
        onConfirm={() => {
          const intent = confirmation;
          setConfirmation(null);
          if (intent) void send(intent);
        }}
      />
    </>
  );
}

type ChannelsProps = {
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  options: readonly DestinationDto[];
  control: ReactNode;
};

function Channels({ isPending, isError, onRetry, options, control }: ChannelsProps) {
  if (isPending) {
    return (
      <div className={styles.group} aria-busy="true">
        <span className={styles.groupLabel}>{copy.publish.channel}</span>
        <Skeleton height={44} radius="var(--radius-2)" />
      </div>
    );
  }
  if (isError) {
    return (
      <Banner
        tone="error"
        title={copy.publish.channelsError}
        action={
          <Button variant="secondary" size="sm" icon="retry" onPress={onRetry}>
            {copy.publish.channelsRetry}
          </Button>
        }
      />
    );
  }
  if (options.length === 0) {
    return (
      <Banner
        tone="info"
        title={copy.publish.noChannelsTitle}
        action={
          <Link to={CHANNELS_PATH} className={styles.link}>
            {copy.publish.noChannelsAction}
          </Link>
        }
      >
        {copy.publish.noChannelsBody}
      </Banner>
    );
  }
  return <>{control}</>;
}
