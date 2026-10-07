import type { DestinationDto } from '@alexeev/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { useClosingConfirmation } from '../../../shared/telegram/use-closing-confirmation';
import { Banner, Button, Switch, TextField, useToast } from '../../../shared/ui';
import { destinationKeys, useUpdateDestination } from '../api/destinations-queries';
import { displayChatId, parseChatId } from '../model/chat-id';
import { describeFailure, type RequestFailure } from '../model/check-failure';
import { DESTINATION_TITLE_MAX } from '../model/title';
import { useChannelCheck } from '../model/use-channel-check';
import { CheckOutcome } from './CheckOutcome';
import { channelsCopy } from './copy';
import styles from './ChannelEditor.module.css';

const copy = channelsCopy.drawer;
const titleFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { error: channelsCopy.addDialog.titleRequired })
    .max(DESTINATION_TITLE_MAX, { error: channelsCopy.addDialog.titleTooLong(DESTINATION_TITLE_MAX) })
});
type TitleForm = z.infer<typeof titleFormSchema>;

type Props = {
  destination: DestinationDto;
  onOpenOther: (id: string) => void;
  onRightsKnown: (botCanPost: boolean) => void;
};

/** Edits one channel. Every change waits for the server; the form keeps what was typed through any failure. */
export function ChannelEditor({ destination, onOpenOther, onRightsKnown }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const saveMutation = useUpdateDestination();
  const toggleMutation = useUpdateDestination();
  const chatMutation = useUpdateDestination();
  const rights = useChannelCheck();
  const newChat = useChannelCheck();
  const switchRef = useRef<HTMLDivElement>(null);
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [saveFailure, setSaveFailure] = useState<RequestFailure | null>(null);
  const [toggleFailure, setToggleFailure] = useState<RequestFailure | null>(null);
  const [changing, setChanging] = useState(false);
  const [newChatValue, setNewChatValue] = useState('');
  const [newChatInvalid, setNewChatInvalid] = useState(false);
  const [chatFailure, setChatFailure] = useState<RequestFailure | null>(null);

  const form = useForm<TitleForm>({
    resolver: zodResolver(titleFormSchema),
    defaultValues: { title: destination.title },
    mode: 'onSubmit',
    reValidateMode: 'onChange'
  });
  const watchedTitle = useWatch({ control: form.control, name: 'title' });
  const refreshing = useIsFetching({ queryKey: destinationKeys.detail(destination.id) }) > 0;
  const busy = saveMutation.isPending || toggleMutation.isPending || chatMutation.isPending;
  const titleDirty = watchedTitle.trim() !== destination.title;
  useClosingConfirmation(titleDirty);

  // A stale revision means somebody else changed the channel: fetch the current one and show both sides.
  function handleFailure(error: unknown, remember: (failure: RequestFailure) => void) {
    const failure = describeFailure(error);
    if (failure.kind === 'stale_revision') {
      setConflict(true);
      void queryClient.invalidateQueries({ queryKey: destinationKeys.detail(destination.id) });
    } else {
      remember(failure);
    }
  }

  const saveTitle = form.handleSubmit(({ title }) => {
    setSaveFailure(null);
    saveMutation.mutate(
      { id: destination.id, input: { revision: destination.revision, title } },
      {
        onSuccess: (saved) => {
          form.reset({ title: saved.title });
          toast.show({ tone: 'success', title: copy.saved });
        },
        onError: (error) => handleFailure(error, setSaveFailure)
      }
    );
  });

  function setEnabled(enabled: boolean) {
    setToggleFailure(null);
    toggleMutation.mutate(
      { id: destination.id, input: { revision: destination.revision, enabled } },
      {
        onSuccess: (saved) => {
          setConfirmingDisable(false);
          toast.show({ tone: 'success', title: saved.enabled ? copy.enabledToast : copy.disabledToast });
        },
        onError: (error) => handleFailure(error, setToggleFailure)
      }
    );
  }

  function checkRights() {
    rights.run(destination.chatId, (result) => onRightsKnown(result.botCanPost));
  }

  function checkNewChat() {
    const chatId = parseChatId(newChatValue);
    if (chatId === null) {
      setNewChatInvalid(true);
      return;
    }
    newChat.run(chatId);
  }

  function applyNewChat() {
    const result = newChat.result;
    if (!result || !result.botCanPost) return;
    setChatFailure(null);
    chatMutation.mutate(
      { id: destination.id, input: { revision: destination.revision, chatId: result.chatId } },
      {
        onSuccess: () => {
          toast.show({ tone: 'success', title: copy.chatChanged });
          closeChange();
          rights.reset();
          onRightsKnown(true);
        },
        onError: (error) => handleFailure(error, setChatFailure)
      }
    );
  }

  function closeChange() {
    setChanging(false);
    setNewChatValue('');
    setNewChatInvalid(false);
    setChatFailure(null);
    newChat.reset();
  }

  const chatResult = newChat.result;
  const takenByOther =
    chatResult !== null && chatResult.alreadyAddedId !== null && chatResult.alreadyAddedId !== destination.id;
  const canApplyChat =
    chatResult !== null && chatResult.botCanPost && !takenByOther && chatResult.chatId !== destination.chatId;

  return (
    <div className={styles.editor}>
      {conflict ? (
        <Banner
          tone="conflict"
          title={copy.conflict.title}
          action={
            <div className={styles.actions}>
              <Button variant="secondary" size="sm" isDisabled={refreshing} onPress={() => setConflict(false)}>
                {copy.conflict.keepMine}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                isDisabled={refreshing}
                onPress={() => {
                  form.reset({ title: destination.title });
                  closeChange();
                  setConflict(false);
                }}
              >
                {copy.conflict.takeServer}
              </Button>
            </div>
          }
        >
          {refreshing ? (
            <p>{copy.conflict.refreshing}</p>
          ) : (
            <>
              <p>
                {copy.conflict.intro} «{destination.title}»,{' '}
                {destination.enabled ? copy.conflict.enabled : copy.conflict.disabled}.
              </p>
              <p>{copy.conflict.keepHint}</p>
            </>
          )}
        </Banner>
      ) : null}

      <form className={styles.section} onSubmit={(event) => void saveTitle(event)} noValidate>
        <Controller
          control={form.control}
          name="title"
          render={({ field, fieldState }) => (
            <TextField
              label={copy.titleLabel}
              description={copy.titleHint}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              maxLength={DESTINATION_TITLE_MAX}
              errorMessage={fieldState.error?.message}
            />
          )}
        />
        {saveFailure ? <FailureBanner failure={saveFailure} message={copy.saveFailed} /> : null}
        <div className={styles.actions}>
          <Button type="submit" isDisabled={!titleDirty || busy || refreshing} isLoading={saveMutation.isPending}>
            {copy.save}
          </Button>
        </div>
      </form>

      <section className={styles.section} aria-labelledby="channel-publishing">
        <h3 id="channel-publishing" className={styles.heading}>
          {copy.sectionPublishing}
        </h3>
        <div ref={switchRef}>
          <Switch
            isSelected={destination.enabled}
            isDisabled={busy || refreshing || confirmingDisable}
            onChange={(next) => (next ? setEnabled(true) : setConfirmingDisable(true))}
          >
            {copy.enabledLabel}
          </Switch>
        </div>
        <p className={styles.hint}>{copy.enabledHint}</p>
        {confirmingDisable ? (
          <Banner
            tone="warning"
            title={copy.disableTitle}
            action={
              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  size="sm"
                  // Intentional: the safe answer takes focus in a destructive confirmation (skill ui-patterns).
                  // oxlint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  isDisabled={toggleMutation.isPending}
                  onPress={() => {
                    setConfirmingDisable(false);
                    switchRef.current?.querySelector('input')?.focus();
                  }}
                >
                  {copy.disableCancel}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  isLoading={toggleMutation.isPending}
                  onPress={() => setEnabled(false)}
                >
                  {copy.disableConfirm}
                </Button>
              </div>
            }
          >
            <p>{copy.disableBody}</p>
          </Banner>
        ) : null}
        {toggleFailure ? <FailureBanner failure={toggleFailure} message={copy.saveFailed} /> : null}
      </section>

      <section className={styles.section} aria-labelledby="channel-telegram">
        <h3 id="channel-telegram" className={styles.heading}>
          {copy.sectionTelegram}
        </h3>
        <dl className={styles.facts}>
          <dt>{copy.kindLabel}</dt>
          <dd>{channelsCopy.list.kind[destination.kind]}</dd>
          <dt>{copy.chatIdLabel}</dt>
          <dd className={styles.mono}>{destination.chatId}</dd>
        </dl>
        <div className={styles.actions}>
          <Button
            variant="secondary"
            icon="retry"
            isLoading={rights.isChecking}
            isDisabled={rights.waitSeconds > 0}
            onPress={checkRights}
          >
            {rights.waitSeconds > 0 ? channelsCopy.failure.retryIn(rights.waitSeconds) : copy.checkRights}
          </Button>
          {changing ? null : (
            <Button variant="ghost" onPress={() => setChanging(true)}>
              {copy.changeChat}
            </Button>
          )}
        </div>
        <CheckOutcome check={rights} onRetry={checkRights} currentId={destination.id} onOpenExisting={onOpenOther} />

        {changing ? (
          <div className={styles.change}>
            <p className={styles.hint}>{copy.changeChatHint}</p>
            <TextField
              label={copy.newChatLabel}
              description={`Сейчас: ${displayChatId(destination.chatId)}`}
              value={newChatValue}
              onChange={(next) => {
                setNewChatValue(next);
                newChat.reset();
                setChatFailure(null);
                if (newChatInvalid && parseChatId(next) !== null) setNewChatInvalid(false);
              }}
              errorMessage={newChatInvalid ? channelsCopy.addDialog.fieldInvalid : undefined}
              autoComplete="off"
            />
            <CheckOutcome
              check={newChat}
              onRetry={checkNewChat}
              currentId={destination.id}
              onOpenExisting={onOpenOther}
            />
            {chatFailure ? (
              <FailureBanner
                failure={chatFailure}
                message={chatFailure.kind === 'chat_taken' ? copy.chatTaken : copy.saveFailed}
              />
            ) : null}
            {chatResult === null && !newChat.isChecking ? (
              <p className={styles.hint}>{copy.chatChangeNeedsCheck}</p>
            ) : null}
            {canApplyChat ? <p className={styles.hint}>{copy.chatChecked}</p> : null}
            <div className={styles.actions}>
              <Button
                variant="secondary"
                isLoading={newChat.isChecking}
                isDisabled={newChat.waitSeconds > 0}
                onPress={checkNewChat}
              >
                {channelsCopy.addDialog.check}
              </Button>
              <Button
                isDisabled={!canApplyChat || busy || refreshing}
                isLoading={chatMutation.isPending}
                onPress={applyNewChat}
              >
                {copy.applyChat}
              </Button>
              <Button variant="ghost" isDisabled={chatMutation.isPending} onPress={closeChange}>
                {copy.cancelChange}
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function FailureBanner({ failure, message }: { failure: RequestFailure; message: string }) {
  const detail =
    failure.kind === 'forbidden'
      ? channelsCopy.failure.forbidden.body
      : failure.kind === 'unavailable'
        ? channelsCopy.failure.unavailable.body
        : null;
  return (
    <Banner tone="error" title={message}>
      {detail ? <p>{detail}</p> : null}
      {failure.requestId ? (
        <p className={styles.hint}>
          {channelsCopy.failure.requestId}: <code>{failure.requestId}</code>
        </p>
      ) : null}
    </Banner>
  );
}
