import type { ReactNode } from 'react';
import { ru } from '../lib/ru';
import styles from './Field.module.css';
import { VisuallyHidden } from './VisuallyHidden';

/** The counter becomes a polite announcement only from 90 % of the limit; typing never chatters before that. */
const ANNOUNCE_FROM = 0.9;

type Props = { length: number; limit: number };

/** «58 / 200» for the label row; screen readers hear it only near or past the limit. */
export function LimitCounter({ length, limit }: Props) {
  const text = ru.ui.counter(length, limit);
  const near = length >= limit * ANNOUNCE_FROM;
  return (
    <span className={`${styles.counter} ${length > limit ? styles.counterOver : ''}`}>
      <span aria-hidden="true">{text}</span>
      <span aria-live="polite" aria-atomic="true">
        {near ? <VisuallyHidden>{text}</VisuallyHidden> : null}
      </span>
    </span>
  );
}

/** Label plus an optional right-aligned slot (counter) on one row. */
export function LabelRow({ children, counter }: { children: ReactNode; counter?: ReactNode }) {
  if (counter === undefined || counter === null) return <>{children}</>;
  return (
    <div className={styles.labelRow}>
      {children}
      {typeof counter === 'string' || typeof counter === 'number' ? (
        <span className={styles.counter}>{counter}</span>
      ) : (
        counter
      )}
    </div>
  );
}
