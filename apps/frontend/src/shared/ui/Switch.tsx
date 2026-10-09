import type { ReactNode } from 'react';
import { Switch as AriaSwitch, type SwitchProps } from 'react-aria-components';
import { Icon, type IconName } from './Icon';
import styles from './Switch.module.css';

type Props = Omit<SwitchProps, 'children' | 'className'> & {
  children: ReactNode;
  /** `inline` is the label next to the track; `row` is a full-width settings row with the track at the end. */
  variant?: 'inline' | 'row';
  /** Row variant: icon before the label. */
  icon?: IconName;
  /** Row variant: any leading element (a thumbnail) instead of an icon. */
  leading?: ReactNode;
  /** Row variant: muted line under the label. */
  description?: string;
};

export function Switch({ children, variant = 'inline', icon, leading, description, ...rest }: Props) {
  return (
    <AriaSwitch {...rest} data-variant={variant} className={styles.switch}>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
      {variant === 'row' ? (
        <>
          {leading ? (
            <span className={styles.leading}>{leading}</span>
          ) : icon ? (
            <span className={styles.leading} aria-hidden="true">
              <Icon name={icon} size={20} />
            </span>
          ) : null}
          <span className={styles.rowText}>
            <span className={styles.rowLabel}>{children}</span>
            {description ? <span className={styles.rowDescription}>{description}</span> : null}
          </span>
        </>
      ) : (
        children
      )}
    </AriaSwitch>
  );
}
