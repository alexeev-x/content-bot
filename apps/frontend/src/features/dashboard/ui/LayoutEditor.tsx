import { useState, type ReactNode } from 'react';
import { DragHandle, IconButton, Menu, ResizeHandle, SortableGrid, useMediaQuery } from '../../../shared/ui';
import { useNow } from '../../../shared/lib/use-now';
import { PHONE_QUERY } from '../model/phone';
import { moveItems, removeItem, resizeItem, shiftItem } from '../model/layout-ops';
import { CATALOG, WIDTH_LABELS, type LayoutItem, type WidgetWidth } from '../model/widget-catalog';
import { copy } from './copy';
import { cellStyle, renderWidget } from './DashboardLayout';
import styles from './LayoutEditor.module.css';
import type { WidgetEnv } from './widget-env';

type Props = {
  items: readonly LayoutItem[];
  /** The same data the page shows, so every widget is drawn with its real content while it is arranged. */
  env: Omit<WidgetEnv, 'now' | 'phone'>;
  onChange: (items: LayoutItem[], announcement: string) => void;
};

/**
 * The allowed width closest to where the pointer is: columns are counted from the card's left edge on the
 * 12-column grid, so dragging the right edge feels like stretching the card over the columns.
 */
function widthAt(clientX: number, handle: HTMLElement, widths: readonly WidgetWidth[]): WidgetWidth | null {
  const cell = handle.closest('[role="row"]');
  const grid = handle.closest('[role="grid"]');
  if (!cell || !grid) return null;
  const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0;
  const column = (grid.getBoundingClientRect().width - 11 * gap) / 12;
  const span = (clientX - cell.getBoundingClientRect().left + gap) / (column + gap);
  return widths.reduce((best, w) => (Math.abs(w - span) < Math.abs(best - span) ? w : best));
}

/**
 * Edit mode of Обзор: every widget keeps its real content (inert, so a press cannot leave the page) under a thin
 * bar with the grip, the name, the width, a menu and «×». Drag the grip to reorder and the right edge to resize
 * (mouse, touch or keyboard); nothing reaches the server until «Готово».
 */
export function LayoutEditor({ items, env, onChange }: Props) {
  // A phone shows one column: the width applies to wider screens only, so it is not offered there.
  const phone = useMediaQuery(PHONE_QUERY);
  const now = useNow();
  const [resizing, setResizing] = useState<string | null>(null);
  const resize = (item: LayoutItem, w: WidgetWidth) =>
    onChange(resizeItem(items, item.id, w), copy.edit.resized(CATALOG[item.kind].title, WIDTH_LABELS[w]));
  const title = (item: LayoutItem) => CATALOG[item.kind].title;
  const full = { ...env, now };

  const toolbar = (item: LayoutItem): ReactNode => {
    const entry = CATALOG[item.kind];
    const index = items.indexOf(item);
    return (
      <div className={styles.bar}>
        <DragHandle label={copy.edit.drag(entry.title)} />
        <span className={styles.title}>{entry.title}</span>
        {phone ? null : <span className={styles.width}>{WIDTH_LABELS[item.w]}</span>}
        <Menu
          label={copy.edit.menu(entry.title)}
          triggerSize="target"
          items={[
            { id: 'earlier', label: copy.edit.earlier, icon: 'arrow-left', isDisabled: index === 0 },
            { id: 'later', label: copy.edit.later, icon: 'arrow-right', isDisabled: index === items.length - 1 }
          ]}
          onAction={(action) => {
            const next = shiftItem(items, item.id, action === 'earlier' ? -1 : 1);
            onChange(next, copy.edit.moved(entry.title, next.findIndex((i) => i.id === item.id) + 1, next.length));
          }}
        />
        <IconButton
          icon="x"
          size="target"
          variant="ghost"
          label={copy.edit.removeLabel(entry.title)}
          onPress={() => onChange(removeItem(items, item.id), copy.edit.removed(entry.title))}
        />
      </div>
    );
  };

  return (
    <SortableGrid
      label={copy.edit.grid}
      items={items}
      textValue={title}
      itemStyle={cellStyle}
      onMove={(keys, target, position) => {
        const next = moveItems(items, keys, target, position);
        const moved = next.find((item) => item.id === keys[0]);
        onChange(next, moved ? copy.edit.moved(title(moved), next.indexOf(moved) + 1, next.length) : '');
      }}
    >
      {(item) => {
        const entry = CATALOG[item.kind];
        return (
          <div className={styles.card} data-resizing={resizing === item.id || undefined}>
            {toolbar(item)}
            <div className={styles.preview} inert>
              {renderWidget(item, full, phone)}
            </div>
            {phone ? null : (
              <ResizeHandle
                label={copy.edit.widthOf(entry.title)}
                valueText={WIDTH_LABELS[item.w]}
                value={entry.widths.indexOf(item.w)}
                min={0}
                max={entry.widths.length - 1}
                onDrag={(clientX, handle) => {
                  setResizing(item.id);
                  const w = widthAt(clientX, handle, entry.widths);
                  if (w !== null && w !== item.w) resize(item, w);
                }}
                onDragEnd={() => setResizing(null)}
                onSelect={(index) => {
                  const next = entry.widths[index];
                  if (next !== undefined && next !== item.w) resize(item, next);
                }}
              />
            )}
          </div>
        );
      }}
    </SortableGrid>
  );
}
