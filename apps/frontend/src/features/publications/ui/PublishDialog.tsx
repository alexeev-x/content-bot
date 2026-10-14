import type { DestinationDto, PostDto, PublicationDto } from '@alexeev/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { now, parseAbsolute, type ZonedDateTime } from '@internationalized/date';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, type LinkProps } from '@tanstack/react-router';
import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
  Banner,
  Button,
  DateTimeField,
  Dialog,
  Select,
  SegmentedControl,
  Skeleton,
  TelegramPreview
} from '../../../shared/ui';
import { publishDestinationsQueryOptions } from '../api/publications-queries';
import { formatShort, formatWithZone } from '../model/format-time';
import { defaultScheduledAt, publishFormSchema, type PublishFormValues } from '../model/publish-form';
import { usePublish } from '../model/use-publish';
import { copy } from './copy';
import { PublishDuplicateDialog } from './PublishDuplicateDialog';
import styles from './PublishDialog.module.css';

type Props = {
  post: PostDto;
  timezone?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onPublished?: (publication: PublicationDto) => void;
  initialSettings?: { destinationId: string; mode: 'now' | 'later'; scheduledAt: ZonedDateTime };
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
  initialSettings
}: Props) {
  const formId = useId();
  const queryClient = useQueryClient();
  const destinations = useQuery({ ...publishDestinationsQueryOptions(), enabled: isOpen });
  const openRef = useRef(isOpen);
  useEffect(() => {
    openRef.current = isOpen;
  }, [isOpen]);
  const publish = usePublish(post, configuredTimezone, {
    onSettled: () => onOpenChange(false),
    ...(onPublished ? { onPublished } : {}),
    canShowBanner: () => openRef.current
  });
  const { zone, isApproved } = publish;
  const appliedKey = useRef<string | null>(null);

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

  const pending = publish.findPending(values.destinationId);
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
  const visibleFailure = publish.failure;

  function submit(event: FormEvent<HTMLFormElement>) {
    // A pending intent is sent as it was, so it skips validation of a time that may have passed meanwhile.
    if (pending) {
      event.preventDefault();
      void publish.resendPending(pending);
      return;
    }
    void form.handleSubmit((formValues) => publish.start(formValues))(event);
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
              isLoading={publish.isPending}
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
                  isDisabled={Boolean(pending)}
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
                  isDisabled={Boolean(pending)}
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
      <PublishDuplicateDialog publish={publish} />
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
