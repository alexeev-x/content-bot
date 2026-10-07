import { useId, type ReactNode } from 'react';
import styles from './Dashboard.module.css';

type Props = {
  title: string;
  /** Muted text beside the heading (the zone and offset of the day). */
  note?: string;
  /** Optional navigation/action rendered in the card header. */
  action?: ReactNode;
  children: ReactNode;
};

/** A dashboard block: a labelled card with an H2 (heading order: H1 of the page, then one H2 per block). */
export function Block({ title, note, action, children }: Props) {
  const headingId = useId();
  return (
    <section className={styles.block} aria-labelledby={headingId}>
      <div className={styles.blockHead}>
        <div className={styles.blockHeading}>
          <h2 id={headingId} className={styles.blockTitle}>
            {title}
          </h2>
          {note ? <span className={styles.note}>{note}</span> : null}
        </div>
        {action ? <div className={styles.blockAction}>{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
