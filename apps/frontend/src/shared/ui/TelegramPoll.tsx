import type { ReactNode } from 'react';
import styles from './TelegramPoll.module.css';

type Props = {
  question: ReactNode;
  options: readonly string[];
  /** Square marks instead of circles: more than one answer can be picked. */
  multiple?: boolean;
  /** «Анонимный опрос» / «Викторина»: the line under the question. */
  kindLabel: string;
  /** Shown for an option that has no text yet. */
  emptyOption: (index: number) => string;
};

/**
 * The poll body of a Telegram message, for the preview bubble (`TelegramPreview` body slot). Always the empty poll as
 * the channel shows it before anyone votes: no counts, no percentages.
 */
export function TelegramPoll({ question, options, multiple = false, kindLabel, emptyOption }: Props) {
  return (
    <div className={styles.poll}>
      <strong className={styles.question}>{question}</strong>
      <span className={styles.kind}>{kindLabel}</span>
      <ul className={styles.options}>
        {options.map((option, index) => (
          // The list is the preview of a draft that is rewritten as a whole; an index is its only identity.
          // oxlint-disable-next-line react/no-array-index-key
          <li key={index} className={styles.option}>
            <span className={styles.mark} data-shape={multiple ? 'square' : 'circle'} aria-hidden="true" />
            <span className={option.trim() === '' ? styles.placeholder : undefined}>
              {option.trim() === '' ? emptyOption(index) : option}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
