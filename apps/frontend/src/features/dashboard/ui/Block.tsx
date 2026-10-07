import { useId, type ReactNode } from 'react';
import styles from './Dashboard.module.css';

type Props = {
  title: string;
  /** Muted text beside the heading (the zone and offset of the day). */
  note?: string;
  children: ReactNode;
};

/** A dashboard block: a labelled section with an H2 (heading order: H1 of the page, then one H2 per block). */
export function Block({ title, note, children }: Props) {
  const headingId = useId();
  return (
    <section className={styles.block} aria-labelledby={headingId}>
      <div className={styles.blockHead}>
        <h2 id={headingId} className={styles.blockTitle}>
          {title}
        </h2>
        {note ? <span className={styles.note}>{note}</span> : null}
      </div>
      {children}
    </section>
  );
}
