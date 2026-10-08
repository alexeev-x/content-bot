import { Icon } from '../../../shared/ui';
import { dateChipText } from '../model/format';
import { useNow } from '../model/use-now';
import styles from './Dashboard.module.css';

type Props = {
  /** `below` is the phone placement under the title; the header copy is hidden there. */
  placement: 'header' | 'below';
  /** «Europe/Chisinau, UTC+3»: the zone the time is shown in, as a tooltip. */
  zoneNote?: string;
};

/** «Вт, 7 окт. 2026 · 21:05»: minute precision, not a live region. */
export function DateChip({ placement, zoneNote }: Props) {
  const now = useNow();
  return (
    <span
      className={`${styles.dateChip} ${placement === 'below' ? styles.dateBelow : ''}`}
      {...(zoneNote ? { title: zoneNote } : {})}
    >
      <Icon name="calendar" size={16} />
      <time dateTime={now.toISOString()}>{dateChipText(now)}</time>
    </span>
  );
}
