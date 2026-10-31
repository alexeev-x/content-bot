import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';
import { Icon, type IconName } from './Icon';

type Props = {
  title: string;
  /** Teach the next useful action; distinguish «no data yet» from «filters hide everything». */
  description?: string;
  /** Same as `description`. */
  hint?: string;
  icon?: IconName;
  action?: ReactNode;
  /** `compact`: an inline row for the body of a Panel («пока пусто»), no heading and no dashed box. */
  size?: 'page' | 'compact';
};

export function EmptyState({ title, description, hint, icon, action, size = 'page' }: Props) {
  const text = description ?? hint;
  if (size === 'compact') {
    return (
      <div className={styles.compact}>
        {icon ? <Icon name={icon} size={20} className={styles.compactIcon} /> : null}
        <div className={styles.compactText}>
          <p className={styles.compactTitle}>{title}</p>
          {text ? <p className={styles.description}>{text}</p> : null}
        </div>
        {action ? <div className={styles.compactAction}>{action}</div> : null}
      </div>
    );
  }
  return (
    <div className={styles.empty}>
      {icon ? (
        <span className={styles.icon}>
          <Icon name={icon} size={20} />
        </span>
      ) : null}
      <h2 className={styles.title}>{title}</h2>
      {text ? <p className={styles.description}>{text}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
