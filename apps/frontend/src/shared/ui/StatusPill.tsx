import { Icon, type IconName } from './Icon';
import styles from './StatusBadge.module.css';
import type { StatusGroup } from './status-meta';

type Props = { label: string; group: StatusGroup; icon: IconName };

/** StatusBadge for a state that is not one of the canonical statuses (a derived list state); same look, caller-supplied text. */
export function StatusPill({ label, group, icon }: Props) {
  return (
    <span className={styles.badge} data-group={group}>
      <Icon name={icon} size={15} />
      {label}
    </span>
  );
}
