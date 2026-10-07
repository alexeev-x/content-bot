import type { ReactNode } from 'react';
import { ru } from '../lib/ru';
import styles from './TelegramPreview.module.css';

type Props = {
  title?: string;
  /** Plain text or rendered entities: line breaks are kept, nothing is parsed as HTML. */
  body: ReactNode;
  /** Time and views line, e.g. «12:30». */
  meta?: string;
};

/** Approximation of the message bubble in a Telegram channel; the real render comes from the server preview. */
export function TelegramPreview({ title, body, meta }: Props) {
  return (
    <figure className={styles.chat} aria-label={ru.ui.previewLabel}>
      <div className={styles.bubble}>
        {title ? <strong className={styles.title}>{title}</strong> : null}
        <div className={styles.body}>{body}</div>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </div>
    </figure>
  );
}
