import type { CSSProperties, ReactNode } from 'react';
import { FIXED_WIDGETS, type FixedWidget } from '../model/default-layout';
import { GAP, ROW_HEIGHT } from '../model/geometry';
import styles from './Dashboard.module.css';

type Props = {
  phone: boolean;
  /** Names the grid for assistive technology. */
  label: string;
  children: (widget: FixedWidget) => ReactNode;
};

/**
 * Plain CSS Grid (12 columns, 56 px rows, 16 px gap) with every widget at its fixed cell.
 * A phone gets one column in the listed order and ignores widths and heights.
 */
export function WidgetGrid({ phone, label, children }: Props) {
  const geometry = { '--dash-row': `${ROW_HEIGHT}px`, '--dash-gap': `${GAP}px` } as CSSProperties;
  return (
    <section className={styles.grid} data-phone={phone || undefined} style={geometry} aria-label={label}>
      {FIXED_WIDGETS.map((widget) => (
        <div
          key={widget.type}
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
    </section>
  );
}
