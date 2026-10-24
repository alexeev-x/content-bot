import type { ReactNode } from 'react';
import { Panel, Skeleton } from '../../../shared/ui';
import styles from './PanelSkeleton.module.css';

type Props = {
  title: string;
  note?: string;
  /** The loaded heading icon, so the title does not move sideways when the data arrives. */
  icon?: ReactNode;
  /** The loaded header control (a segmented switch), so the header keeps its height. */
  action?: ReactNode;
  /** Body height of the loaded panel in panel rows (56 px) on a wide screen and on a phone. */
  rows: number;
  phoneRows: number;
};

/**
 * A report panel before its data exists: the real header and a body that already has the height the data
 * will fill (measured on the default view), so the sections below do not move when the report arrives.
 */
export function PanelSkeleton({ title, note, icon, action, rows, phoneRows }: Props) {
  return (
    <Panel
      title={title}
      headingLevel={2}
      quiet
      reserveRows={rows}
      reservePhoneRows={phoneRows}
      {...(note ? { note } : {})}
      {...(icon ? { icon } : {})}
      {...(action ? { action } : {})}
    >
      <div className={styles.body} aria-hidden="true">
        <Skeleton lines={3} height={20} />
      </div>
    </Panel>
  );
}
