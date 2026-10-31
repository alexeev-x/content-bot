import type { ReactNode } from 'react';
import styles from './ListRow.module.css';
import { Skeleton } from './Skeleton';

type Props = {
  title: string;
  /** Time or icon in a fixed 56 px, tabular-nums slot. */
  leading?: ReactNode;
  /** One muted line, ellipsis. */
  meta?: ReactNode;
  /** A StatusPill; on a phone it drops under the title. */
  status?: ReactNode;
  /**
   * Switch or menu: its own 44 px target outside the press area. An icon-only control here must carry its own
   * `aria-label` (a Switch without a visible label has none otherwise).
   */
  trailing?: ReactNode;
  /** Picture / poll icons after the title. */
  markers?: ReactNode;
  onPress?: () => void;
  /** Makes the press area a link. */
  href?: string;
  isActive?: boolean;
  isDimmed?: boolean;
  isDisabled?: boolean;
  /** 52 px (default) or 44 px. */
  density?: 'row' | 'compact';
};

/** Dense row of a `PanelList` (desktop sibling of RowCard, same anatomy); the whole row except `trailing` is the press area. */
export function ListRow({
  title,
  leading,
  meta,
  status,
  trailing,
  markers,
  onPress,
  href,
  isActive,
  isDimmed,
  isDisabled,
  density = 'row'
}: Props) {
  const content = (
    <>
      {leading ? <span className={styles.leading}>{leading}</span> : null}
      <span className={styles.title}>
        <span className={styles.titleText}>{title}</span>
        {markers ? <span className={styles.markers}>{markers}</span> : null}
      </span>
      {status ? <span className={styles.status}>{status}</span> : null}
      {meta ? <span className={styles.meta}>{meta}</span> : null}
    </>
  );
  const attrs = {
    className: styles.main,
    'data-lead': leading ? '' : undefined,
    'data-status': status ? '' : undefined
  };
  return (
    <li
      className={styles.row}
      data-density={density}
      data-active={isActive || undefined}
      data-dimmed={isDimmed || undefined}
      data-disabled={isDisabled || undefined}
    >
      {href && !isDisabled ? (
        <a {...attrs} href={href} aria-current={isActive ? 'true' : undefined}>
          {content}
        </a>
      ) : onPress || isDisabled ? (
        <button type="button" {...attrs} disabled={isDisabled} onClick={onPress}>
          {content}
        </button>
      ) : (
        <div {...attrs}>{content}</div>
      )}
      {trailing ? <div className={styles.trailing}>{trailing}</div> : null}
    </li>
  );
}

/** Loading twin of ListRow with the same geometry, so the list does not jump when data arrives. */
export function ListRowSkeleton({
  density = 'row',
  withLeading = true
}: {
  density?: 'row' | 'compact';
  withLeading?: boolean;
}) {
  return (
    <li className={styles.row} data-density={density} aria-hidden="true">
      <div className={styles.main} data-lead={withLeading ? '' : undefined}>
        {withLeading ? (
          <span className={styles.leading}>
            <Skeleton width={36} height={14} />
          </span>
        ) : null}
        <span className={styles.title}>
          <Skeleton width="70%" height={14} />
        </span>
        <span className={styles.meta}>
          <Skeleton width="40%" height={12} />
        </span>
      </div>
    </li>
  );
}
