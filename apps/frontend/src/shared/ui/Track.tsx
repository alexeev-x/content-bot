import type { CSSProperties, ReactNode } from 'react';
import styles from './Track.module.css';
import { VisuallyHidden } from './VisuallyHidden';

type Props = {
  label: string;
  /** The figure at the end of the row, e.g. «12 · 40%». */
  value: ReactNode;
  /** 0–100: the filled share of the track. */
  share: number;
  /** Accessible text of the value when `value` is not plain text. */
  valueText?: string;
};

/**
 * Label, track and figure. From 480 px of the container's width: one line. Narrower: the label and the figure on one
 * line, the full-width track under them, so the track is never cut off in a phone or a narrow column.
 */
export function Track({ label, value, share, valueText }: Props) {
  const clamped = Math.max(0, Math.min(100, share));
  return (
    <div className={styles.box}>
      <div className={styles.row}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>{value}</span>
        <VisuallyHidden>
          <meter min={0} max={100} value={clamped} aria-label={label} aria-valuetext={valueText} />
        </VisuallyHidden>
        <span className={styles.track} aria-hidden="true">
          <span className={styles.fill} style={{ '--share': `${clamped}%` } as CSSProperties} />
        </span>
      </div>
    </div>
  );
}
