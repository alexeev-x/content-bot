import { useId, type CSSProperties, type ReactNode } from 'react';
import styles from './Dashboard.module.css';

type Props = {
  /** `data-widget` hook: the grid places the widget by it. */
  id: string;
  title: string;
  /** Link or small button at the right of the header. */
  action?: ReactNode;
  busy?: boolean;
  /** Hides the header strip (the widget draws its own heading). */
  bare?: boolean;
  style?: CSSProperties;
  children: ReactNode;
};

/** The shared frame of a widget: bordered surface, heading, one optional action. What is inside is each widget's own form. */
export function Widget({ id, title, action, busy, bare, style, children }: Props) {
  const headingId = useId();
  return (
    <section
      className={styles.widget}
      data-widget={id}
      aria-labelledby={headingId}
      aria-busy={busy || undefined}
      style={style}
    >
      <header className={bare ? styles.headBare : styles.head}>
        <h2 id={headingId} className={bare ? styles.srOnly : styles.title}>
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}
