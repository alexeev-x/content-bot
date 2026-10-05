import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

type Props = { title: string; description?: string; action?: ReactNode };

export function EmptyState({ title, description, action }: Props) {
  return (
    <div className={styles.empty}>
      <h2 className={styles.title}>{title}</h2>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
