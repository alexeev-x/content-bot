import { ru } from '../lib/ru';
import { VisuallyHidden } from './VisuallyHidden';
import styles from './Spinner.module.css';

type Props = { size?: number; label?: string | false };

/** `label={false}` makes it decorative (inside a button that already says it is busy). */
export function Spinner({ size = 20, label = ru.ui.loading }: Props) {
  return (
    <span className={styles.spinner} role={label ? 'status' : undefined} style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true" className={styles.svg}>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      {label ? <VisuallyHidden>{label}</VisuallyHidden> : null}
    </span>
  );
}
