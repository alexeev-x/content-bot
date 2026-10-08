import type { ReactNode } from 'react';
import styles from './Card.module.css';

type Props = {
  title?: string;
  /** Header-right slot: a link or a small button. */
  actions?: ReactNode;
  children: ReactNode;
};

/** The quiet panel surface with padded content; use Panel when rows should run flush to the edges. */
export function Card({ title, actions, children }: Props) {
  return (
    <section className={styles.card}>
      {title || actions ? (
        <header className={styles.header}>
          {title ? <h2 className={styles.title}>{title}</h2> : null}
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
