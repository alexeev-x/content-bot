import type { ReactNode } from 'react';
import styles from './Card.module.css';

type Props = {
  title?: string;
  /** Header-right slot: a link or a small button. */
  actions?: ReactNode;
  children: ReactNode;
};

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
