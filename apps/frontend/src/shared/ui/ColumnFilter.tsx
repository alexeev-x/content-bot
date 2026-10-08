import type { ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import styles from './ColumnFilter.module.css';
import { Icon } from './Icon';
import { Popover } from './Popover';

type Props = {
  /** Accessible name of the button and the popover, e.g. «Фильтр по статусу». */
  label: string;
  icon?: 'filter' | 'search';
  /** The column is currently filtered: the button turns accent and announces it. */
  isActive?: boolean;
  isDisabled?: boolean;
  children: ReactNode;
};

/**
 * A filter or search control inside a table column header (desktop): the list keeps its full height for rows and
 * the control sits where the data it narrows is. Phones have no header row and use the filter sheet instead.
 */
export function ColumnFilter({ label, icon = 'filter', isActive = false, isDisabled = false, children }: Props) {
  return (
    <Popover
      label={label}
      trigger={
        <AriaButton
          className={styles.trigger}
          aria-label={isActive ? `${label} (включён)` : label}
          data-active={isActive || undefined}
          isDisabled={isDisabled}
        >
          <Icon name={icon} size={14} />
        </AriaButton>
      }
    >
      <div className={styles.body}>{children}</div>
    </Popover>
  );
}
