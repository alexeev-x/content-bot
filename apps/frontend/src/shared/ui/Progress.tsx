import { ProgressBar as AriaProgressBar } from 'react-aria-components';
import styles from './Progress.module.css';

export type ProgressTone = 'accent' | 'done' | 'failed';

type BaseProps = {
  /** Names the progress for assistive technology (visible text next to it does not name the bar). */
  label: string;
  /** 0–100. Omit for an indeterminate state. */
  value?: number | undefined;
  tone?: ProgressTone;
};

/** Thin horizontal bar (upload row). The percentage text, if shown, is the caller's job: it is not colour-only. */
export function ProgressBar({ label, value, tone = 'accent' }: BaseProps) {
  return (
    <AriaProgressBar
      aria-label={label}
      value={value ?? 0}
      isIndeterminate={value === undefined}
      data-tone={tone}
      className={styles.bar}
    >
      {({ percentage }) => <span className={styles.fill} style={{ width: `${percentage ?? 0}%` }} />}
    </AriaProgressBar>
  );
}

const RADIUS = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type RingProps = BaseProps & {
  /** Outer size in px (tile overlay 48, row 20). */
  size?: number;
  /** Shows the rounded percentage in the middle. */
  showValue?: boolean;
  /** `media` sits on a photo (dark scrim, lifted colours); `flat` sits on a theme surface (rows, dialogs). */
  surface?: 'media' | 'flat';
};

/** Circular progress for a media tile or a queue row; sits on photos, so the track is the media scrim. */
export function ProgressRing({
  label,
  value,
  tone = 'accent',
  size = 48,
  showValue = true,
  surface = 'media'
}: RingProps) {
  const clamped = value === undefined ? undefined : Math.max(0, Math.min(100, value));
  return (
    <AriaProgressBar
      aria-label={label}
      value={clamped ?? 0}
      isIndeterminate={clamped === undefined}
      data-tone={tone}
      data-surface={surface}
      className={styles.ring}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className={styles.ringSvg}>
        <circle cx="24" cy="24" r={RADIUS} className={styles.ringTrack} />
        <circle
          cx="24"
          cy="24"
          r={RADIUS}
          className={styles.ringFill}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - (clamped ?? 25) / 100)}
        />
      </svg>
      {showValue && clamped !== undefined ? (
        <span className={styles.ringValue} style={{ fontSize: Math.max(10, size * 0.22) }}>
          {Math.round(clamped)}%
        </span>
      ) : null}
    </AriaProgressBar>
  );
}
