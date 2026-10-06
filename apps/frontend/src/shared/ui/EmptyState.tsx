import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';
import { Icon, type IconName } from './Icon';

type Props = {
  title: string;
  /** Teach the next useful action; distinguish «no data yet» from «filters hide everything». */
  description?: string;
  icon?: IconName;
  action?: ReactNode;
};

export function EmptyState({ title, description, icon, action }: Props) {
  return (
    <div className={styles.empty}>
      {icon ? (
        <span className={styles.icon}>
          <Icon name={icon} size={22} />
        </span>
      ) : null}
      <h2 className={styles.title}>{title}</h2>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
