import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components';
import { Icon } from './Icon';
import styles from './StatusChip.module.css';

export type StatusChipTone = 'ok' | 'warning' | 'danger' | 'unknown' | 'neutral';

type Props = Omit<AriaButtonProps, 'children' | 'className'> & {
  tone: StatusChipTone;
  /** Short text that says the state ("Система в порядке", "Бот не подключён"); the tone alone never carries it. */
  label: string;
  /** Last check time, shown in mono. */
  time?: string;
  className?: string;
};

/**
 * Content-width status pill that opens details. It is a React Aria button, so it works as a Popover trigger
 * (aria-expanded comes from the trigger) or with a manual `aria-expanded` for a bottom sheet.
 * A healthy state shows a dot; a problem shows an alert icon, so shape and text carry the meaning as well as colour.
 */
export function StatusChip({ tone, label, time, className, ...rest }: Props) {
  return (
    <AriaButton {...rest} data-tone={tone} className={[styles.chip, className].filter(Boolean).join(' ')}>
      {tone === 'ok' || tone === 'neutral' ? (
        <span className={styles.dot} aria-hidden="true" />
      ) : (
        <Icon name="alert" size={14} className={styles.icon} />
      )}
      <span className={styles.label}>{label}</span>
      {time ? <time className={styles.time}>{time}</time> : null}
      <Icon name="chevron-down" size={14} className={styles.chevron} />
    </AriaButton>
  );
}
