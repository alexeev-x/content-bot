import type { ReactNode } from 'react';
import styles from './Dashboard.module.css';

type Props = {
  /** `inline`: title and channel share one line (wide left column); `stacked`: channel under the title. */
  layout: 'inline' | 'stacked';
  time?: ReactNode;
  badge?: ReactNode;
  title: string;
  channel?: string | undefined;
  hint?: string;
  trail?: ReactNode;
};

/** One dense row: time, badge, title with channel, one action. Text clips with an ellipsis; the full title is in `title`. */
export function Row({ layout, time, badge, title, channel, hint, trail }: Props) {
  return (
    <li className={styles.row} data-layout={layout}>
      {time ? <span className={styles.time}>{time}</span> : null}
      {badge ? <span className={styles.badge}>{badge}</span> : null}
      <span className={styles.main}>
        <span className={styles.titleLine}>
          <span className={styles.title} title={title}>
            {title}
          </span>
          {channel ? (
            <span className={styles.channel} title={channel}>
              {channel}
            </span>
          ) : null}
        </span>
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </span>
      {trail ? <span className={styles.trail}>{trail}</span> : null}
    </li>
  );
}
