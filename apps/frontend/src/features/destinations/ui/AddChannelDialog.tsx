import type { DestinationDto } from '@alexeev/contracts';
import { useRef, useState, type FormEvent } from 'react';
import { Banner, Button, Dialog, Drawer, TextField, useMediaQuery, useToast } from '../../../shared/ui';
import { useCreateDestination } from '../api/destinations-queries';
import { parseChatId } from '../model/chat-id';
import { describeFailure, type RequestFailure } from '../model/check-failure';
import { createFailureMessage } from '../model/save-failure';
import { DESTINATION_TITLE_MAX, isValidTitle, truncateTitle } from '../model/title';
import { useChannelCheck } from '../model/use-channel-check';
import { CheckOutcome } from './CheckOutcome';
import { channelsCopy } from './copy';
import styles from './AddChannelDialog.module.css';

const copy = channelsCopy.addDialog;
const FORM_ID = 'add-channel-form';

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the server confirmed the new channel. */
  onCreated: (destination: DestinationDto, botCanPost: boolean) => void;
  onOpenExisting: (id: string) => void;
};

/** Opening starts a fresh flow: nothing typed or checked last time may vouch for the next channel. */
export function AddChannelDialog(props: Props) {
  const [generation, setGeneration] = useState(0);
  const [wasOpen, setWasOpen] = useState(false);
  if (props.isOpen !== wasOpen) {
    setWasOpen(props.isOpen);
    if (props.isOpen) setGeneration((value) => value + 1);
  }
  return <AddChannelFlow key={generation} {...props} />;
}

function AddChannelFlow({ isOpen, onOpenChange, onCreated, onOpenExisting }: Props) {
  const isNarrow = useMediaQuery('(max-width: 859px)');
  const toast = useToast();
  const check = useChannelCheck();
  const create = useCreateDestination();
  const fieldRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState('');
  const [inputInvalid, setInputInvalid] = useState(false);
  // null = follow Telegram's title; the operator's own text wins once they type.
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [titleTouched, setTitleTouched] = useState(false);
  const [saveFailure, setSaveFailure] = useState<RequestFailure | null>(null);

  const { result } = check;
  const title = titleDraft ?? truncateTitle(result?.title ?? '');
  const canSave = result !== null && result.botCanPost && result.alreadyAddedId === null && isValidTitle(title);
  const titleInvalid = result !== null && titleTouched && !isValidTitle(title);

  function runCheck() {
    const chatId = parseChatId(value);
    if (chatId === null) {
      setInputInvalid(true);
      fieldRef.current?.querySelector('input')?.focus();
      return;
    }
    setSaveFailure(null);
    check.run(chatId);
  }

  function save() {
    if (!result || !canSave || create.isPending) return;
    setSaveFailure(null);
    create.mutate(
      { title: title.trim(), chatId: result.chatId, kind: result.kind },
      {
        onSuccess: (destination) => {
          toast.show({ tone: 'success', title: copy.saved(destination.title) });
          onCreated(destination, result.botCanPost);
          onOpenChange(false);
        },
        onError: (error) => setSaveFailure(describeFailure(error))
      }
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (canSave) save();
    else if (result === null && !check.isChecking && check.waitSeconds === 0) runCheck();
    else setTitleTouched(true);
  }

  function changeValue(next: string) {
    setValue(next);
    // The answer belongs to the old input: it must not unlock saving for the new one.
    check.reset();
    setSaveFailure(null);
    setTitleDraft(null);
    setTitleTouched(false);
    if (inputInvalid && parseChatId(next) !== null) setInputInvalid(false);
  }

  function changeOpen(open: boolean) {
    // A create in flight cannot be taken back; closing now would hide its outcome.
    if (!open && create.isPending) return;
    onOpenChange(open);
  }

  const footer = (
    <>
      <Button variant="secondary" isDisabled={create.isPending} onPress={() => onOpenChange(false)}>
        {copy.cancel}
      </Button>
      <Button type="submit" form={FORM_ID} isDisabled={!canSave} isLoading={create.isPending}>
        {copy.save}
      </Button>
    </>
  );

  const body = (
    <form id={FORM_ID} className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.lookup}>
        <div ref={fieldRef} className={styles.field}>
          <TextField
            label={copy.fieldLabel}
            description={copy.fieldHint}
            value={value}
            onChange={changeValue}
            errorMessage={inputInvalid ? copy.fieldInvalid : undefined}
            autoComplete="off"
            // Intentional: the dialog has exactly one task, and its field is where it starts.
            // oxlint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        </div>
        <Button
          variant="secondary"
          className={styles.checkButton}
          isLoading={check.isChecking}
          isDisabled={check.waitSeconds > 0}
          onPress={runCheck}
        >
          {copy.check}
        </Button>
      </div>
      <CheckOutcome check={check} onRetry={runCheck} onOpenExisting={onOpenExisting} />
      {result ? (
        <TextField
          label={copy.titleLabel}
          description={copy.titleHint}
          value={title}
          maxLength={DESTINATION_TITLE_MAX}
          onChange={(next) => {
            setTitleDraft(next);
            setTitleTouched(true);
          }}
          onBlur={() => setTitleTouched(true)}
          errorMessage={titleInvalid ? copy.titleRequired : undefined}
        />
      ) : (
        <p className={styles.hint}>{copy.saveDisabledHint}</p>
      )}
      {saveFailure ? (
        <Banner tone="error" title={copy.saveFailed}>
          <p>{createFailureMessage(saveFailure)}</p>
          {saveFailure.kind === 'chat_taken' ? (
            <Button variant="secondary" size="sm" onPress={runCheck}>
              {copy.checkAgain}
            </Button>
          ) : null}
          {saveFailure.requestId ? (
            <p className={styles.requestId}>
              {channelsCopy.failure.requestId}: <code>{saveFailure.requestId}</code>
            </p>
          ) : null}
        </Banner>
      ) : null}
    </form>
  );

  // Below 860 px the flow is a full-screen sheet (the Drawer's narrow layout); above it a centred dialog.
  return isNarrow ? (
    <Drawer isOpen={isOpen} onOpenChange={changeOpen} title={copy.title} footer={footer}>
      {body}
    </Drawer>
  ) : (
    <Dialog isOpen={isOpen} onOpenChange={changeOpen} title={copy.title} footer={footer}>
      {body}
    </Dialog>
  );
}
