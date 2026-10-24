import type { ReactNode } from 'react';
import { ru } from '../lib/ru';
import { ProgressBar } from './Progress';
import styles from './StaleRegion.module.css';

type Props = {
  /** The content shows the previous tab's rows while the new tab loads. */
  busy: boolean;
  children: ReactNode;
};

/**
 * Keeps a table mounted while another tab's data loads: rows dim and stop reacting (`inert`), a thin
 * indeterminate bar sits on top, and the height never changes, so a tab switch does not blink.
 */
export function StaleRegion({ busy, children }: Props) {
  return (
    <div className={styles.region} aria-busy={busy}>
      {busy ? (
        <div className={styles.bar}>
          <ProgressBar label={ru.ui.loading} />
        </div>
      ) : null}
      <div className={styles.content} data-busy={busy || undefined} inert={busy}>
        {children}
      </div>
    </div>
  );
}
