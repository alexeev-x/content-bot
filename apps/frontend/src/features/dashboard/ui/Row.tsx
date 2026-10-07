import { Link, type LinkProps } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import styles from './Dashboard.module.css';

type Props = {
  layout: 'inline' | 'stacked';
  time?: ReactNode;
  badge?: ReactNode;
  title: string;
  channel?: string | undefined;
  hint?: string;
  trail?: ReactNode;
  to?: LinkProps['to'];
  search?: LinkProps['search'];
};

/** One dense dashboard row. When a target is supplied, the title/channel area opens that exact object. */
export function Row({ layout, time, badge, title, channel, hint, trail, to, search }: Props) {
  const main = (
    <>
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
    </>
  );

  return (
    <li className={styles.row} data-layout={layout}>
      {time ? <span className={styles.time}>{time}</span> : null}
      {badge ? <span className={styles.badge}>{badge}</span> : null}
      {to ? (
        <Link to={to} search={search} className={`${styles.main} ${styles.rowLink}`}>
          {main}
        </Link>
      ) : (
        <span className={styles.main}>{main}</span>
      )}
      {trail ? <span className={styles.trail}>{trail}</span> : null}
    </li>
  );
}
