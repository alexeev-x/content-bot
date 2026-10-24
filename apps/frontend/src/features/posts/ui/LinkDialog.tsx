import { POST_ENTITY_URL_MAX } from '@alexeev/contracts';
import { useState, type FormEvent } from 'react';
import { Button, Dialog, TextField } from '../../../shared/ui';
import { parseLinkInput } from '../model/link-url';
import { postsCopy } from './copy';
import styles from './EditorDialogs.module.css';

export type LinkDialogStart = {
  href: string;
  /** The link is on selected text or text under the cursor; otherwise the operator also types the link text. */
  hasText: boolean;
  isLink: boolean;
};

type Props = {
  start: LinkDialogStart;
  onApply: (result: { href: string; text: string | null }) => void;
  onRemove: () => void;
  onClose: () => void;
};

const copy = postsCopy.editor.linkDialog;
const FORM_ID = 'link-dialog-form';

/** Mounted only while open, so every opening starts from the link under the cursor with clean errors. */
export function LinkDialog({ start, onApply, onRemove, onClose }: Props) {
  const [href, setHref] = useState(start.href);
  const [text, setText] = useState('');
  const [hrefError, setHrefError] = useState<string | undefined>();
  const [textError, setTextError] = useState<string | undefined>();

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseLinkInput(href);
    const nextHrefError = parsed.ok
      ? undefined
      : parsed.reason === 'required'
        ? copy.urlRequired
        : parsed.reason === 'too_long'
          ? copy.urlTooLong(POST_ENTITY_URL_MAX)
          : copy.urlInvalid;
    const nextTextError = start.hasText || text.trim() !== '' ? undefined : copy.textRequired;
    setHrefError(nextHrefError);
    setTextError(nextTextError);
    if (!parsed.ok || nextTextError !== undefined) return;
    onApply({ href: parsed.href, text: start.hasText ? null : text });
  }

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={copy.title}
      description={copy.description}
      footer={
        <>
          {start.isLink ? (
            <Button variant="secondary" onPress={onRemove}>
              {copy.remove}
            </Button>
          ) : null}
          <Button variant="ghost" onPress={onClose}>
            {copy.cancel}
          </Button>
          <Button type="submit" form={FORM_ID}>
            {copy.apply}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className={styles.form}>
        {start.hasText ? null : (
          <TextField
            label={copy.textLabel}
            value={text}
            onChange={setText}
            errorMessage={textError}
            // oxlint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        )}
        <TextField
          label={copy.urlLabel}
          value={href}
          onChange={setHref}
          errorMessage={hrefError}
          placeholder="https://"
          type="url"
          inputMode="url"
          // oxlint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={start.hasText}
        />
      </form>
    </Dialog>
  );
}
