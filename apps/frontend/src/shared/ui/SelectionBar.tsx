import type { ReactNode } from 'react';
import styles from './SelectionBar.module.css';

type Props = {
  /** Accessible name of the toolbar. */
  label: string;
  /** «Выбрано: N»; announced politely when it changes. */
  summary: string;
  /** Extra line under the summary (a limit hint). */
  hint?: string;
  /** Buttons: the bulk actions and «Снять выделение». */
  children: ReactNode;
};

/** Bulk-action bar of a list in selection mode: sticks to the bottom of the viewport so the actions stay in reach. */
export function SelectionBar({ label, summary, hint, children }: Props) {
  return (
    <div className={styles.bar} role="toolbar" aria-label={label}>
      <div className={styles.text}>
        <output className={styles.summary}>{summary}</output>
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </div>
      <div className={styles.actions}>{children}</div>
    </div>
  );
}
