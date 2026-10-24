import { POST_ENTITY_LANGUAGE_MAX } from '@alexeev/contracts';
import { useState, type FormEvent } from 'react';
import { Button, Dialog, TextField } from '../../../shared/ui';
import { isCodeLanguage } from '../model/code-language';
import { postsCopy } from './copy';
import styles from './EditorDialogs.module.css';

type Props = {
  language: string;
  onApply: (language: string | null) => void;
  onClose: () => void;
};

const copy = postsCopy.editor.languageDialog;
const FORM_ID = 'code-language-form';

/** Mounted only while open (fresh field every time). An empty value clears the language. */
export function CodeLanguageDialog({ language, onApply, onClose }: Props) {
  const [value, setValue] = useState(language);
  const [error, setError] = useState<string | undefined>();

  function submit(event: FormEvent) {
    event.preventDefault();
    const typed = value.trim();
    if (!isCodeLanguage(typed)) {
      setError(copy.invalid(POST_ENTITY_LANGUAGE_MAX));
      return;
    }
    onApply(typed === '' ? null : typed);
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
        <TextField label={copy.label} value={value} onChange={setValue} errorMessage={error} />
      </form>
    </Dialog>
  );
}
