import type { ReactNode } from 'react';
import { Checkbox as AriaCheckbox, type CheckboxProps } from 'react-aria-components';
import styles from './Checkbox.module.css';

type Props = Omit<CheckboxProps, 'children' | 'className'> & {
  /** Omit only when an aria-label names the box (table selection). */
  children?: ReactNode;
  description?: string;
};

export function Checkbox({ children, description, ...rest }: Props) {
  return (
    <AriaCheckbox {...rest} className={styles.checkbox}>
      {({ isIndeterminate }) => (
        <>
          <span className={styles.box} aria-hidden="true">
            <svg
              viewBox="0 0 18 18"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {isIndeterminate ? <path d="M4 9h10" /> : <path d="m4 9.5 3.2 3.2L14 5.8" />}
            </svg>
          </span>
          {children ? (
            <span className={styles.text}>
              {children}
              {description ? <span className={styles.description}>{description}</span> : null}
            </span>
          ) : null}
        </>
      )}
    </AriaCheckbox>
  );
}
