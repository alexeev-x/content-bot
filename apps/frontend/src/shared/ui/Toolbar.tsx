import type { ReactNode } from 'react';
import styles from './Toolbar.module.css';

type Props = {
  /** Names the filter group for assistive technology. */
  label: string;
  children: ReactNode;
};

/** A filter row: put one growing control (search) and inline controls inside; it wraps on narrow screens. */
export function Toolbar({ label, children }: Props) {
  return (
    // A fieldset would bring its own box model; the group role names the filter row for assistive technology.
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
    <div role="group" aria-label={label} className={styles.toolbar}>
      {children}
    </div>
  );
}

/** The part that takes the free width (usually the SearchField). */
export function ToolbarGrow({ children }: { children: ReactNode }) {
  return <div className={styles.grow}>{children}</div>;
}
