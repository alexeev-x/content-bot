import type { DashboardWidget } from '@alexeev/contracts';
import type { CSSProperties, ReactNode } from 'react';
import { GAP, ROW_HEIGHT } from '../model/geometry';
import { sequence } from '../model/layout-ops';
import styles from './Dashboard.module.css';

type Props = {
  widgets: readonly DashboardWidget[];
  phone: boolean;
  /** Names the grid for assistive technology. */
  label?: string;
  children: (widget: DashboardWidget) => ReactNode;
};

/**
 * The view-mode layout: plain CSS Grid (12 columns, 56 px rows, 16 px gap) with every widget at its saved cell.
 * A phone gets one column in reading order (top to bottom, left to right) and ignores widths and heights.
 */
export function WidgetGrid({ widgets, phone, label, children }: Props) {
  const geometry = { '--dash-row': `${ROW_HEIGHT}px`, '--dash-gap': `${GAP}px` } as CSSProperties;
  const ordered = phone ? sequence(widgets) : widgets;
  return (
    <div
      className={styles.grid}
      data-phone={phone || undefined}
      style={geometry}
      {...(label ? { role: 'group', 'aria-label': label } : {})}
    >
      {ordered.map((widget) => (
        <div
          key={widget.id}
          className={styles.item}
          data-widget={widget.type}
          style={
            phone
              ? undefined
              : ({
                  gridColumn: `${widget.x + 1} / span ${widget.w}`,
                  gridRow: `${widget.y + 1} / span ${widget.h}`
                } as CSSProperties)
          }
        >
          {children(widget)}
        </div>
      ))}
    </div>
  );
}
