import type { DestinationDto } from '@alexeev/contracts';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Banner, Button, Dialog, Drawer, LinkButton, TextField, useMediaQuery, useToast } from '../../../shared/ui';
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
  /** Bot @username (without «@») for the «add the bot to a channel» link; the link is hidden without it. */
  botUsername?: string | undefined;
};

/** How many times coming back to the tab re-checks the same input before the operator must press the button. */
const MAX_AUTO_CHECKS = 5;
const AUTO_CHECK_DELAY_MS = 800;

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

function AddChannelFlow({ isOpen, onOpenChange, onCreated, onOpenExisting, botUsername }: Props) {
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
  const step = check.isChecking ? 1 : result !== null ? 2 : 0;
  const titleInvalid = result !== null && titleTouched && !isValidTitle(title);

  const autoChecks = useRef(0);
  const latest = useRef({ value, canCheck: false, runAuto: () => {} });

  function runAuto() {
    const chatId = parseChatId(value);
    if (chatId === null || autoChecks.current >= MAX_AUTO_CHECKS) return;
    autoChecks.current += 1;
    setSaveFailure(null);
    check.run(chatId);
  }
  const canCheck = isOpen && !check.isChecking && check.waitSeconds === 0 && !(result?.botCanPost ?? false);
  useEffect(() => {
    latest.current = { value, canCheck, runAuto };
  });

  // Returning from Telegram (after adding the bot) re-checks the channel on its own, a bounded number of times.
  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState === 'visible' && latest.current.canCheck) latest.current.runAuto();
    };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, []);

  // A valid, settled input is checked without a button press.
  useEffect(() => {
    if (!isOpen || parseChatId(value) === null) return;
    const timer = setTimeout(() => {
      if (latest.current.canCheck && latest.current.value === value) latest.current.runAuto();
    }, AUTO_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [value, isOpen]);

  function runCheck() {
    const chatId = parseChatId(value);
    if (chatId === null) {
      setInputInvalid(true);
      fieldRef.current?.querySelector('input')?.focus();
      return;
    }
    setSaveFailure(null);
    autoChecks.current = 0;
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
    autoChecks.current = 0;
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
      <ol className={styles.steps} aria-label={copy.steps.label}>
        {[copy.steps.input, copy.steps.check, copy.steps.save].map((label, index) => (
          <li key={label} aria-current={index === step ? 'step' : undefined}>
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      <Banner tone="info" title={copy.prereqTitle}>
        {copy.prereqBody}
        {botUsername ? (
          <p>
            {copy.botLead} <strong>@{botUsername}</strong>
          </p>
        ) : null}
      </Banner>
      {botUsername ? (
        <LinkButton
          href={`https://t.me/${botUsername}?startchannel&admin=post_messages`}
          target="_blank"
          rel="noreferrer"
          variant="secondary"
        >
          {copy.addBot}
        </LinkButton>
      ) : null}
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
        {check.isChecking ? <p className={styles.hint}>{copy.checking}</p> : null}
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
