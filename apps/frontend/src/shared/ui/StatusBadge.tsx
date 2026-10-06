import { Icon } from './Icon';
import styles from './StatusBadge.module.css';
import { statusMeta, type StatusKey } from './status-meta';

type Props = { status: StatusKey };

/** Pill = icon + canonical Russian text + tinted fill + 1 px ring; colour is never the only signal. */
export function StatusBadge({ status }: Props) {
  const { label, group, icon } = statusMeta(status);
  return (
    <span className={styles.badge} data-group={group} data-status={status}>
      <Icon name={icon} size={15} />
      {label}
    </span>
  );
}
