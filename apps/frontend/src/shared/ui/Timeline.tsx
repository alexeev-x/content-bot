import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { StatusBadge } from './StatusBadge';
import styles from './Timeline.module.css';
import { statusMeta, type StatusKey } from './status-meta';

export type TimelineItem = {
  id: string;
  title: string;
  /** Formatted by the caller with an explicit time zone. */
  time: string;
  dateTime?: string;
  status?: StatusKey;
  description?: ReactNode;
};

type Props = { items: readonly TimelineItem[]; 'aria-label': string };

/** Attempt history: newest first or oldest first is the caller's order. */
export function Timeline({ items, 'aria-label': label }: Props) {
  return (
    <ol className={styles.timeline} aria-label={label}>
      {items.map((item) => {
        const meta = item.status ? statusMeta(item.status) : null;
        return (
          <li key={item.id} className={styles.item} data-group={meta?.group ?? 'muted'}>
            <span className={styles.dot}>
              <Icon name={meta?.icon ?? 'clock'} size={14} />
            </span>
            <div className={styles.content}>
              <div className={styles.head}>
                <strong className={styles.title}>{item.title}</strong>
                {item.status ? <StatusBadge status={item.status} /> : null}
              </div>
              <time className={`mono ${styles.time}`} dateTime={item.dateTime}>
                {item.time}
              </time>
              {item.description ? <div className={styles.description}>{item.description}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
