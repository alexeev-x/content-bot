import { Link } from '@tanstack/react-router';
import type { CSSProperties, ReactNode } from 'react';
import { Icon, MediaTile, Panel, Skeleton, type IconName } from '../../../shared/ui';
import { formatClock } from '../../../shared/lib/clock';
import { otherDay } from '../model/format';
import styles from './Dashboard.module.css';

export type PanelArea =
  | 'attention'
  | 'today'
  | 'upcoming'
  | 'recent'
  | 'system'
  | 'drafts'
  | 'week'
  | 'channels'
  | 'incidents'
  | 'quick-actions';

type PanelLinkProps = { text: string } & (
  | { to: '/incidents' }
  | { to: '/settings/channels' }
  | { to: '/publications'; search: { view?: 'upcoming' | 'recent' } }
  | { to: '/posts'; search: { view?: 'drafts' } }
);

/** The «Все …» link of a panel header. */
export function PanelLink(props: PanelLinkProps) {
  const body = (
    <>
      {props.text}
      <Icon name="chevron-right" size={14} />
    </>
  );
  if (props.to === '/incidents') return <Link to="/incidents">{body}</Link>;
  if (props.to === '/settings/channels') return <Link to="/settings/channels">{body}</Link>;
  if (props.to === '/posts') {
    return (
      <Link to="/posts" search={props.search}>
        {body}
      </Link>
    );
  }
  return (
    <Link to="/publications" search={props.search}>
      {body}
    </Link>
  );
}

type SectionProps = {
  area: PanelArea;
  title: string;
  /** Only where the number is actionable (Требует внимания, Сегодня). */
  count?: string;
  action?: ReactNode;
  /** Rows the body reserves, so a panel keeps its height from skeleton to data and to its empty line. */
  rows: number;
  busy?: boolean;
  children: ReactNode;
};

/** One dashboard panel: a grid cell with a quiet 48 px strip and a body that keeps the skeleton height. */
export function Section({ area, title, count, action, rows, busy, children }: SectionProps) {
  return (
    <div className={styles.cell} data-area={area} aria-busy={busy || undefined}>
      <Panel
        quiet
        title={title}
        headingLevel={2}
        marker={count !== undefined ? <span className={styles.count}>{count}</span> : undefined}
        action={action}
      >
        <div className={styles.fill} style={{ '--rows': rows } as CSSProperties}>
          {children}
        </div>
      </Panel>
    </div>
  );
}

/** One quiet line (optionally with an icon and one button) inside the panel's reserved height. */
export function EmptyLine({ icon, text, action }: { icon?: IconName; text: string; action?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <p>
        {icon ? <Icon name={icon} size={18} /> : null}
        {text}
      </p>
      {action}
    </div>
  );
}

/** Skeleton rows with the loaded row geometry: fixed boxes for time and tile, so nothing shifts on arrival. */
export function SkeletonRows({ count, tile = true }: { count: number; tile?: boolean }) {
  return (
    <ul className={styles.skList} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className={styles.skRow}>
          <span className={styles.skTime}>
            <Skeleton width={36} height={14} />
          </span>
          {tile ? <Skeleton width={40} height={40} /> : null}
          <span className={styles.skText}>
            <Skeleton height={14} width={index % 2 ? '52%' : '68%'} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Table skeleton: 32 px header strip and 44 px rows, as the loaded «Последние публикации» table. */
export function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className={styles.skTable} aria-hidden="true">
      <div className={styles.skTableHead}>
        <Skeleton width={40} height={10} />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={styles.skTableRow}>
          <Skeleton width={36} height={12} />
          <Skeleton width={32} height={32} />
          <Skeleton width={index % 2 ? '40%' : '55%'} height={12} />
        </div>
      ))}
    </div>
  );
}

/** «14:30», with the day («8 окт.») under it when the time is not today. */
export function TimeCell({ iso, now, withDay = false }: { iso: string; now: Date; withDay?: boolean }) {
  const day = withDay ? otherDay(iso, now) : undefined;
  return (
    <time className={styles.time} dateTime={iso}>
      {formatClock(iso)}
      {day ? <small>{day}</small> : null}
    </time>
  );
}

/** No media API yet: every real row shows the same icon tile an image would fill. */
export function RowTile({ size = 40 }: { size?: 32 | 40 | 44 }) {
  return <MediaTile size={size} icon="send" />;
}
