import type { CSSProperties, ReactNode } from 'react';
import {
  Button as AriaButton,
  DropIndicator,
  GridList,
  GridListItem,
  useDragAndDrop,
  type Key
} from 'react-aria-components';
import { Icon } from './Icon';
import styles from './SortableGrid.module.css';

type Item = { id: string };

type Props<T extends Item> = {
  /** Names the grid for assistive technology. */
  label: string;
  items: readonly T[];
  /** Text a screen reader announces for an item and the drag preview shows. */
  textValue: (item: T) => string;
  /** Grid placement of the item (e.g. its column span). */
  itemStyle?: (item: T) => CSSProperties;
  /** Moves `keys` before or after `target`; the owner of the order applies it. */
  onMove: (keys: string[], target: string, position: 'before' | 'after') => void;
  children: (item: T) => ReactNode;
};

/**
 * A grid whose items the owner reorders by dragging (mouse, touch, keyboard and screen readers via React Aria
 * drag and drop). Each item puts a `DragHandle` where it wants the grip.
 */
export function SortableGrid<T extends Item>({ label, items, textValue, itemStyle, onMove, children }: Props<T>) {
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ 'text/plain': String(key) })),
    onReorder: (event) => {
      if (event.target.dropPosition === 'on') return;
      onMove(
        [...event.keys].map((key: Key) => String(key)),
        String(event.target.key),
        event.target.dropPosition
      );
    },
    renderDropIndicator: (target) => <DropIndicator target={target} className={styles.indicator} />
  });
  return (
    <GridList
      aria-label={label}
      layout="grid"
      items={items}
      dragAndDropHooks={dragAndDropHooks}
      className={styles.grid}
    >
      {(item) => (
        <GridListItem id={item.id} textValue={textValue(item)} className={styles.item} style={itemStyle?.(item)}>
          {children(item)}
        </GridListItem>
      )}
    </GridList>
  );
}

/** The grip of a `SortableGrid` item: drag it, or focus it and press Enter to move by keyboard. */
export function DragHandle({ label }: { label: string }) {
  return (
    <AriaButton slot="drag" aria-label={label} className={styles.handle}>
      <Icon name="grip" size={18} />
    </AriaButton>
  );
}
