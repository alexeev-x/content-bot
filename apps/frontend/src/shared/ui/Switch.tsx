import type { ReactNode } from 'react';
import { Switch as AriaSwitch, type SwitchProps } from 'react-aria-components';
import styles from './Switch.module.css';

type Props = Omit<SwitchProps, 'children' | 'className'> & { children: ReactNode };

export function Switch({ children, ...rest }: Props) {
  return (
    <AriaSwitch {...rest} className={styles.switch}>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
      {children}
    </AriaSwitch>
  );
}
