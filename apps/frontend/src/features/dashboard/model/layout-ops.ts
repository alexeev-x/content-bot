import type { LayoutItem, WidgetKind, WidgetWidth } from './widget-catalog';
import { newItem } from './widget-catalog';

/** Moves `ids` (in their current order) before or after `target`. */
export function moveItems(
  items: readonly LayoutItem[],
  ids: readonly string[],
  target: string,
  position: 'before' | 'after'
): LayoutItem[] {
  if (ids.includes(target)) return [...items];
  const moving = items.filter((item) => ids.includes(item.id));
  const rest = items.filter((item) => !ids.includes(item.id));
  const at = rest.findIndex((item) => item.id === target);
  if (at === -1) return [...items];
  const index = position === 'before' ? at : at + 1;
  return [...rest.slice(0, index), ...moving, ...rest.slice(index)];
}

/** One step earlier (-1) or later (+1) in reading order; at an end nothing changes. */
export function shiftItem(items: readonly LayoutItem[], id: string, step: -1 | 1): LayoutItem[] {
  const from = items.findIndex((item) => item.id === id);
  const to = from + step;
  if (from === -1 || to < 0 || to >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved) next.splice(to, 0, moved);
  return next;
}

export function resizeItem(items: readonly LayoutItem[], id: string, w: WidgetWidth): LayoutItem[] {
  return items.map((item) => (item.id === id ? { ...item, w } : item));
}

export function removeItem(items: readonly LayoutItem[], id: string): LayoutItem[] {
  return items.filter((item) => item.id !== id);
}

/** A new widget goes to the top, where the owner sees it at once. */
export function addItem(items: readonly LayoutItem[], kind: WidgetKind): LayoutItem[] {
  if (items.some((item) => item.kind === kind)) return [...items];
  return [newItem(kind), ...items];
}

export function sameLayout(a: readonly LayoutItem[], b: readonly LayoutItem[]): boolean {
  return a.length === b.length && a.every((item, i) => item.id === b[i]?.id && item.w === b[i]?.w);
}
