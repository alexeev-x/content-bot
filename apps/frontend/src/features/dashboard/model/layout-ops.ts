import {
  DASHBOARD_GRID_COLUMNS,
  DASHBOARD_GRID_MAX_ROW,
  DASHBOARD_WIDGET_MAX_HEIGHT,
  type DashboardWidget,
  type DashboardWidgetType
} from '@alexeev/contracts';
import { WIDGETS } from './widget-catalog';

// Pure operations on a layout. Every result is a new array; the server never repacks, so each operation
// returns a layout without overlaps and inside the grid.

export type Widgets = readonly DashboardWidget[];
export type Direction = 'left' | 'right' | 'up' | 'down';
export type ResizeStep = 'wider' | 'narrower' | 'taller' | 'shorter';

const COLS = DASHBOARD_GRID_COLUMNS;

const hit = (a: DashboardWidget, b: DashboardWidget) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const sharesRows = (a: DashboardWidget, b: DashboardWidget) => a.y < b.y + b.h && b.y < a.y + a.h;
const sharesCols = (a: DashboardWidget, b: DashboardWidget) => a.x < b.x + b.w && b.x < a.x + a.w;
const readingOrder = (a: DashboardWidget, b: DashboardWidget) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id);

/** Widgets in the order a phone shows them: top to bottom, then left to right. */
export const sequence = (widgets: Widgets): DashboardWidget[] => [...widgets].sort(readingOrder);

/**
 * Pushes colliding widgets down, then lifts every widget as far up as it can go (vertical compaction).
 * Input order is kept in the result.
 */
export function compact(widgets: Widgets): DashboardWidget[] {
  const placed = new Map<string, DashboardWidget>();
  const list: DashboardWidget[] = [];
  for (const item of sequence(widgets)) {
    let y = item.y;
    while (list.some((other) => hit(other, { ...item, y }))) y += 1;
    while (y > 0 && !list.some((other) => hit(other, { ...item, y: y - 1 }))) y -= 1;
    const next = { ...item, y };
    list.push(next);
    placed.set(item.id, next);
  }
  return widgets.map((item) => placed.get(item.id) ?? item);
}

const replace = (widgets: Widgets, id: string, patch: Partial<DashboardWidget>) =>
  widgets.map((item) => (item.id === id ? { ...item, ...patch } : item));

/** One step in a direction: swaps with the nearest neighbour that way, or goes to the edge when there is none. */
export function move(widgets: Widgets, id: string, direction: Direction): DashboardWidget[] {
  const me = widgets.find((item) => item.id === id);
  if (!me) return [...widgets];
  const others = widgets.filter((item) => item.id !== id);
  let next: DashboardWidget[] = [...widgets];
  if (direction === 'left') {
    const near = others
      .filter((o) => sharesRows(o, me) && o.x + o.w <= me.x)
      .sort((a, b) => b.x + b.w - (a.x + a.w))[0];
    if (near) next = replace(replace(widgets, id, { x: near.x }), near.id, { x: near.x + me.w });
    else if (me.x > 0) next = replace(widgets, id, { x: 0 });
  } else if (direction === 'right') {
    const near = others.filter((o) => sharesRows(o, me) && o.x >= me.x + me.w).sort((a, b) => a.x - b.x)[0];
    if (near) next = replace(replace(widgets, id, { x: near.x + near.w - me.w }), near.id, { x: me.x });
    else if (me.x + me.w < COLS) next = replace(widgets, id, { x: COLS - me.w });
  } else if (direction === 'up') {
    const near = others
      .filter((o) => sharesCols(o, me) && o.y + o.h <= me.y)
      .sort((a, b) => b.y + b.h - (a.y + a.h))[0];
    if (near) next = replace(replace(widgets, id, { y: near.y }), near.id, { y: near.y + me.h });
  } else {
    const near = others.filter((o) => sharesCols(o, me) && o.y >= me.y + me.h).sort((a, b) => a.y - b.y)[0];
    // The neighbour takes this widget's row; the widget follows right below it.
    if (near) next = replace(replace(widgets, near.id, { y: me.y }), id, { y: me.y + near.h });
  }
  return sameLayout(next, widgets) ? [...widgets] : compact(next);
}

/** One step of width or height within the widget's minimum and the grid. */
export function resize(widgets: Widgets, id: string, step: ResizeStep): DashboardWidget[] {
  const me = widgets.find((item) => item.id === id);
  if (!me) return [...widgets];
  const min = WIDGETS[me.type].min;
  let patch: Partial<DashboardWidget> | null = null;
  if (step === 'wider') {
    if (me.x + me.w < COLS) patch = { w: me.w + 1 };
    else if (me.x > 0 && me.w < COLS) patch = { x: me.x - 1, w: me.w + 1 };
  } else if (step === 'narrower') {
    if (me.w > min.w) patch = { w: me.w - 1 };
  } else if (step === 'taller') {
    if (me.h < DASHBOARD_WIDGET_MAX_HEIGHT) patch = { h: me.h + 1 };
  } else if (me.h > min.h) {
    patch = { h: me.h - 1 };
  }
  return patch ? compact(replace(widgets, id, patch)) : [...widgets];
}

/** Closes the gap the widget leaves; `keepOrder` (phone) leaves the others where they are so their order cannot change. */
export function remove(widgets: Widgets, id: string, keepOrder = false): DashboardWidget[] {
  const rest = widgets.filter((item) => item.id !== id);
  return keepOrder ? rest : compact(rest);
}

/** The first free spot that fits the default size, scanning rows top to bottom; below everything otherwise. */
export function add(widgets: Widgets, type: DashboardWidgetType): DashboardWidget[] {
  const { w, h } = WIDGETS[type].size;
  const bottom = widgets.reduce((max, item) => Math.max(max, item.y + item.h), 0);
  const id = widgets.some((item) => item.id === type) ? `${type}-${widgets.length + 1}` : type;
  for (let y = 0; y <= bottom; y += 1) {
    for (let x = 0; x + w <= COLS; x += 1) {
      const candidate: DashboardWidget = { id, type, x, y, w, h };
      if (!widgets.some((item) => hit(item, candidate))) return [...widgets, candidate];
    }
  }
  return [...widgets, { id, type, x: 0, y: bottom, w, h }];
}

/**
 * Phone reorder rule. A phone shows widgets in `sequence` order and ignores widths, so a reorder there
 * must change that order and nothing else the desktop cares about: every widget keeps its width and height,
 * and the grid is re-flowed in the new order as rows (a row takes widgets left to right until the 12 columns
 * are full, the next row starts below its tallest widget). No compaction follows, so the order just chosen
 * is exactly the order `sequence` returns afterwards.
 */
export function reorderSequence(widgets: Widgets, orderedIds: readonly string[]): DashboardWidget[] {
  const byId = new Map(widgets.map((item) => [item.id, item] as const));
  const ordered = orderedIds.flatMap((id) => byId.get(id) ?? []);
  const flowed: DashboardWidget[] = [];
  let x = 0;
  let rowTop = 0;
  let rowHeight = 0;
  for (const item of ordered) {
    if (x + item.w > COLS) {
      rowTop += rowHeight;
      x = 0;
      rowHeight = 0;
    }
    flowed.push({ ...item, x, y: rowTop });
    x += item.w;
    rowHeight = Math.max(rowHeight, item.h);
  }
  return flowed;
}

/** Moves one widget one place in the phone sequence; the result is `reorderSequence` of the new order. */
export function shiftInSequence(widgets: Widgets, id: string, by: -1 | 1): DashboardWidget[] {
  const ids = sequence(widgets).map((item) => item.id);
  const from = ids.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= ids.length) return [...widgets];
  ids.splice(to, 0, ...ids.splice(from, 1));
  return reorderSequence(widgets, ids);
}

const key = (item: DashboardWidget) => `${item.id}|${item.type}|${item.x}|${item.y}|${item.w}|${item.h}`;

/** Same widgets at the same places, whatever the array order. */
export function sameLayout(a: Widgets, b: Widgets): boolean {
  if (a.length !== b.length) return false;
  const keys = new Set(a.map(key));
  return b.every((item) => keys.has(key(item)));
}

/** Whether a layout is inside the grid and free of overlaps, mirroring the server so a bad save never leaves the browser. */
export function layoutProblem(widgets: Widgets): 'OUT_OF_GRID' | 'WIDGETS_OVERLAP' | 'DUPLICATE_WIDGET_ID' | null {
  if (new Set(widgets.map((item) => item.id)).size !== widgets.length) return 'DUPLICATE_WIDGET_ID';
  if (widgets.some((item) => item.x + item.w > COLS || item.y > DASHBOARD_GRID_MAX_ROW)) {
    return 'OUT_OF_GRID';
  }
  return widgets.some((a, i) => widgets.slice(i + 1).some((b) => hit(a, b))) ? 'WIDGETS_OVERLAP' : null;
}

/** «строка 3, колонка 1, ширина 8, высота 4»: what the live region says after a move or resize. */
export function describePlacement(item: DashboardWidget): string {
  return `строка ${item.y + 1}, колонка ${item.x + 1}, ширина ${item.w}, высота ${item.h}`;
}
