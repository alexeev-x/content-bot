import { DragHandle, IconButton, Menu, SortableGrid, useMediaQuery } from '../../../shared/ui';
import { PHONE_QUERY } from '../model/phone';
import { moveItems, removeItem, resizeItem, shiftItem } from '../model/layout-ops';
import { CATALOG, WIDTH_LABELS, type LayoutItem, type WidgetWidth } from '../model/widget-catalog';
import { copy } from './copy';
import { cellStyle } from './DashboardLayout';
import styles from './LayoutEditor.module.css';

type Props = {
  items: readonly LayoutItem[];
  onChange: (items: LayoutItem[], announcement: string) => void;
};

/**
 * Edit mode of Обзор: every widget as a light card at its real width. Drag by the grip (mouse, touch or keyboard)
 * or use the card's menus; nothing reaches the server until «Готово».
 */
export function LayoutEditor({ items, onChange }: Props) {
  // A phone shows one column: the width applies to wider screens only, so it is not offered there.
  const phone = useMediaQuery(PHONE_QUERY);
  const title = (item: LayoutItem) => CATALOG[item.kind].title;
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
        const index = items.indexOf(item);
        return (
          <div className={styles.card}>
            <div className={styles.head}>
              <DragHandle label={copy.edit.drag(entry.title)} />
              <span className={styles.title}>{entry.title}</span>
              <IconButton
                icon="x"
                size="target"
                variant="ghost"
                label={copy.edit.removeLabel(entry.title)}
                onPress={() => onChange(removeItem(items, item.id), copy.edit.removed(entry.title))}
              />
            </div>
            <p className={styles.description}>{entry.description}</p>
            <div className={styles.tools}>
              {phone ? (
                <span />
              ) : (
                <Menu
                  label={copy.edit.width}
                  triggerText={WIDTH_LABELS[item.w]}
                  selectionMode="single"
                  selectedId={String(item.w)}
                  items={entry.widths.map((w) => ({ id: String(w), label: WIDTH_LABELS[w] }))}
                  onSelect={(id) => {
                    const w = Number(id) as WidgetWidth;
                    onChange(resizeItem(items, item.id, w), copy.edit.resized(entry.title, WIDTH_LABELS[w]));
                  }}
                />
              )}
              <Menu
                label={copy.edit.menu(entry.title)}
                triggerSize="target"
                items={[
                  { id: 'earlier', label: copy.edit.earlier, icon: 'arrow-left', isDisabled: index === 0 },
                  { id: 'later', label: copy.edit.later, icon: 'arrow-right', isDisabled: index === items.length - 1 },
                  { id: 'remove', label: copy.edit.remove, icon: 'trash', tone: 'danger' }
                ]}
                onAction={(action) => {
                  if (action === 'remove') {
                    onChange(removeItem(items, item.id), copy.edit.removed(entry.title));
                    return;
                  }
                  const next = shiftItem(items, item.id, action === 'earlier' ? -1 : 1);
                  onChange(
                    next,
                    copy.edit.moved(entry.title, next.findIndex((i) => i.id === item.id) + 1, next.length)
                  );
                }}
              />
            </div>
          </div>
        );
      }}
    </SortableGrid>
  );
}
