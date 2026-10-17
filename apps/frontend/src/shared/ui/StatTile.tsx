import type { ReactNode } from 'react';
import { IconBadge } from './IconBadge';
import type { IconName } from './Icon';
import type { StatusGroup } from './status-meta';
import styles from './StatTile.module.css';

type GridProps = {
  /** The tiles; a description list, so each label stays tied to its value for a screen reader. */
  children: ReactNode;
  /** Narrowest tile before the grid wraps to fewer columns. */
  minTile?: 'sm' | 'md';
  /** `two`: at most two tiles per row, one below 19rem (tiles with a leading icon need the room). */
  columns?: 'auto' | 'two';
};

/** A row of figures that wraps by available width (two columns on a phone). */
export function StatGrid({ children, minTile = 'sm', columns = 'auto' }: GridProps) {
  return (
    <dl className={styles.grid} data-min={minTile} data-columns={columns}>
      {children}
    </dl>
  );
}

type Props = {
  label: string;
  value: ReactNode;
  /** One quiet line under the value: a share, a breakdown, a limit. */
  meta?: ReactNode;
  icon?: IconName;
  /** Tints the icon; colour is never the only signal, the label says what it is. */
  tone?: StatusGroup | 'accent';
  /** `start`: the icon leads the text (spend and quality figures); `end`: it sits in the corner. */
  iconAt?: 'start' | 'end';
};

/** One figure with its label: the tile of «Расходы», «Качество» and the bot's numbers. */
export function StatTile({ label, value, meta, icon, tone = 'accent', iconAt = 'end' }: Props) {
  return (
    <div className={styles.tile} data-icon-at={icon ? iconAt : undefined}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{value}</dd>
      {meta === undefined || meta === null ? null : <dd className={styles.meta}>{meta}</dd>}
      {icon ? (
        <dd className={styles.icon} aria-hidden="true">
          <IconBadge name={icon} tone={tone} size="sm" />
        </dd>
      ) : null}
    </div>
  );
}
