import { Link, type LinkProps } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Skeleton } from '../../../shared/ui';
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

/** Placeholder rows with the real row height and column rhythm (time, title, status), hidden from assistive tech. */
export function SkeletonRows({ count }: { count: number }) {
  return (
    <ul className={styles.list} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className={styles.row}>
          <span className={styles.time}>
            <Skeleton width="5ch" height="1em" />
          </span>
          <span className={styles.main}>
            <Skeleton width={index % 2 === 0 ? '62%' : '48%'} height="1em" />
          </span>
          <span className={styles.trail}>
            <Skeleton width={88} height="var(--size-target-min)" radius="var(--radius-pill)" />
          </span>
        </li>
      ))}
    </ul>
  );
}
