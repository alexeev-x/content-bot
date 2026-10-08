import { useId, type CSSProperties, type ReactNode } from 'react';
import styles from './Dashboard.module.css';

type Props = {
  title: string;
  /** Muted text beside the heading (the zone and offset of the day). */
  note?: string;
  /** Icon and «Превью» marker before/after the title. */
  icon?: ReactNode;
  marker?: ReactNode;
  /** Optional navigation/action rendered in the panel header. */
  action?: ReactNode;
  /**
   * Rows the body reserves while loading and when empty, so the panel keeps one height from skeleton to data
   * and only grows when there are more rows than reserved.
   */
  reserveRows?: number;
  children: ReactNode;
};

/** A dashboard panel: a header strip with an H2 (H1 of the page, then one H2 per panel) and a flush body. */
export function Block({ title, note, icon, marker, action, reserveRows = 1, children }: Props) {
  const headingId = useId();
  const reserve = { '--reserve-rows': reserveRows } as CSSProperties;
  return (
    <section className={styles.block} aria-labelledby={headingId}>
      <div className={styles.blockHead}>
        <div className={styles.blockHeading}>
          {icon}
          <h2 id={headingId} className={styles.blockTitle}>
            {title}
          </h2>
          {marker}
          {note ? <span className={styles.note}>{note}</span> : null}
        </div>
        {action ? <div className={styles.blockAction}>{action}</div> : null}
      </div>
      <div className={styles.blockBody} style={reserve}>
        {children}
      </div>
    </section>
  );
}
