import type { ReactNode } from 'react';
import { Icon } from './Icon';
import styles from './RowCard.module.css';

type Props = {
  /** Up to two lines; the row's name for assistive tech. */
  title: string;
  /** Status chip at the right of the title. */
  status?: ReactNode;
  /** One muted line: channel · time. */
  meta?: ReactNode;
  /** Third line only for a warning (an `unknown` publication): text, never colour alone. */
  warning?: string;
  onPress?: () => void;
  /** Checkbox or other leading control, outside the pressable area. */
  leading?: ReactNode;
  /** Thumbnail tile left of the text, inside the tap target; the row keeps its height with or without an image. */
  media?: ReactNode;
  /** The `⋯` menu: its own 44 px target outside the pressable area. */
  menu?: ReactNode;
  isActive?: boolean;
  isDimmed?: boolean;
};

/** Phone row of a Panel list: fixed anatomy (title + chip, meta, optional warning), whole row is the tap target. */
export function RowCard({ title, status, meta, warning, onPress, leading, media, menu, isActive, isDimmed }: Props) {
  return (
    <li className={styles.row} data-active={isActive || undefined} data-dimmed={isDimmed || undefined}>
      {leading ? <div className={styles.leading}>{leading}</div> : null}
      <button type="button" className={styles.main} data-media={media ? '' : undefined} onClick={onPress}>
        {media}
        <span className={styles.body}>
          <span className={styles.top}>
            <span className={styles.title}>{title}</span>
            {status ? <span className={styles.status}>{status}</span> : null}
          </span>
          {meta ? <span className={styles.meta}>{meta}</span> : null}
          {warning ? (
            <span className={styles.warning}>
              <Icon name="alert" size={14} />
              {warning}
            </span>
          ) : null}
        </span>
      </button>
      {menu ? <div className={styles.menu}>{menu}</div> : null}
    </li>
  );
}
