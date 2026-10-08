import { DASHBOARD_GRID_COLUMNS, DASHBOARD_WIDGET_MAX_HEIGHT, type DashboardWidget } from '@alexeev/contracts';
import { useMemo, useState, type ReactNode } from 'react';
import ReactGridLayout, { getCompactor, type Layout } from 'react-grid-layout';
// The package's own stylesheet places the items and the drop placeholder; it ships with this lazy chunk only.
import 'react-grid-layout/css/styles.css';
import { GAP, ROW_HEIGHT } from '../model/geometry';
import { useElementWidth } from '../model/use-element-width';
import type { WidgetAction } from '../model/use-layout-editor';
import { compact, dropTarget } from '../model/layout-ops';
import { WIDGETS } from '../model/widget-catalog';
import { copy } from './copy';
import styles from './DashboardEditor.module.css';
import { DRAG_HANDLE_CLASS, EditCard } from './EditCard';

type Props = {
  widgets: readonly DashboardWidget[];
  /** The grid's own final layout after a drag or a resize (never after a mere render). */
  onCommit: (widgets: readonly DashboardWidget[]) => void;
  /** A pointer drop at the grid cell the dragged widget was released on. */
  onDrop: (id: string, at: { x: number; y: number }) => void;
  onAction: (id: string, action: WidgetAction) => void;
  /** The real content of a widget at its current size. */
  renderBody: (widget: DashboardWidget) => ReactNode;
};

/**
 * Desktop edit mode: react-grid-layout with snapping to the 12 columns and 56 px rows, vertical compaction, a drag
 * handle and a 44 px resize corner. It is loaded only when the owner starts editing, so the view mode never pays for it.
 */
export function EditGrid({ widgets, onCommit, onDrop, onAction, renderBody }: Props) {
  const { ref, width } = useElementWidth();
  const layout = useMemo<Layout>(
    () =>
      widgets.map((widget) => ({
        i: widget.id,
        x: widget.x,
        y: widget.y,
        w: widget.w,
        h: widget.h,
        minW: WIDGETS[widget.type].min.w,
        minH: WIDGETS[widget.type].min.h,
        maxW: DASHBOARD_GRID_COLUMNS,
        maxH: DASHBOARD_WIDGET_MAX_HEIGHT
      })),
    [widgets]
  );
  const [target, setTarget] = useState<string | undefined>(undefined);
  const commit = (next: Layout) => {
    const byId = new Map(widgets.map((widget) => [widget.id, widget] as const));
    // The grid lets items overlap while one is resized; the draft never does.
    onCommit(
      compact(
        next.flatMap((item) => {
          const widget = byId.get(item.i);
          return widget ? [{ ...widget, x: item.x, y: item.y, w: item.w, h: item.h }] : [];
        })
      )
    );
  };
  return (
    <div ref={ref} className={styles.gridHost}>
      {width > 0 ? (
        <ReactGridLayout
          width={width}
          layout={layout}
          gridConfig={{
            cols: DASHBOARD_GRID_COLUMNS,
            rowHeight: ROW_HEIGHT,
            margin: [GAP, GAP],
            containerPadding: [0, 0],
            maxRows: Infinity
          }}
          dragConfig={{ enabled: true, bounded: false, handle: `.${DRAG_HANDLE_CLASS}`, threshold: 3 }}
          resizeConfig={{
            enabled: true,
            handles: ['se'],
            handleComponent: (_axis, ref) => (
              <span ref={ref} className={styles.resize} title={copy.edit.resizeHandle} aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M14 6 6 14M14 11l-3 3" strokeLinecap="round" />
                </svg>
              </span>
            )
          }}
          // Nothing else moves while a widget is dragged: the drop decides (swap or move), then our compaction runs.
          compactor={getCompactor('vertical', true)}
          onDrag={(_layout, _old, item) => setTarget(item ? dropTarget(widgets, item.i, item) : undefined)}
          onDragStop={(_layout, _old, item) => {
            setTarget(undefined);
            if (item) onDrop(item.i, { x: item.x, y: item.y });
          }}
          // The content reflows while the corner is dragged, not only when it is released.
          onResize={(next) => commit(next)}
          onResizeStop={(next) => commit(next)}
        >
          {widgets.map((widget) => (
            <div key={widget.id} className={styles.item}>
              <EditCard widget={widget} draft={widgets} isDropTarget={target === widget.id} onAction={onAction}>
                {renderBody(widget)}
              </EditCard>
            </div>
          ))}
        </ReactGridLayout>
      ) : null}
    </div>
  );
}
