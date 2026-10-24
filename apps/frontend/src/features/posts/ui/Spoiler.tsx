import { useState, type ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { postsCopy } from './copy';
import styles from './EntityText.module.css';

/** Hidden like in Telegram until pressed; a press toggles it so the operator can still read what is behind it. */
export function Spoiler({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <AriaButton
      className={styles.spoiler}
      data-shown={shown || undefined}
      aria-pressed={shown}
      aria-label={shown ? undefined : postsCopy.editor.preview.spoilerHidden}
      onPress={() => setShown((current) => !current)}
    >
      {children}
    </AriaButton>
  );
}
