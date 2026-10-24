import { useEffect, useRef, type ReactNode } from 'react';
import styles from './TableSearch.module.css';

/**
 * The search field of a panel header and the table below it, tied together for the keyboard: Arrow Down in the field
 * moves focus to the first row. React Aria's Autocomplete cannot do this for a Table (a grid takes real focus, so it
 * switches virtual focus off), and the rows are filtered by the caller (`useRowSearch`), which keeps counts, selection
 * and the empty state in step with what is on screen.
 */
export function TableSearch({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  // A listener instead of a JSX handler: the wrapper is not an interactive element, it only watches the field.
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const field = event.target;
      if (event.key !== 'ArrowDown' || !(field instanceof HTMLInputElement) || field.type !== 'search') return;
      const row = element.querySelector<HTMLElement>('[role="grid"] tbody [role="row"]');
      if (!row) return;
      event.preventDefault();
      row.focus();
    };
    element.addEventListener('keydown', onKeyDown);
    return () => element.removeEventListener('keydown', onKeyDown);
  }, []);
  // `display: contents` keeps the wrapper out of the layout.
  return (
    <div ref={root} className={styles.root}>
      {children}
    </div>
  );
}
