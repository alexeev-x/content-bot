import { updateDashboardLayoutInputSchema, type DashboardWidget } from '@alexeev/contracts';
import { describe, expect, it } from 'vitest';
import { DEFAULT_WIDGETS } from '../model/default-layout';
import {
  add,
  dropAt,
  dropTarget,
  moveStep,
  swap,
  layoutProblem,
  move,
  remove,
  reorderSequence,
  resize,
  sameLayout,
  sequence,
  shiftInSequence
} from '../model/layout-ops';
import { weekDays } from '../model/week';

const w = (id: DashboardWidget['type'], x: number, y: number, ww: number, h: number): DashboardWidget => ({
  id,
  type: id,
  x,
  y,
  w: ww,
  h
});
const at = (widgets: readonly DashboardWidget[], id: string) => widgets.find((item) => item.id === id);
const valid = (widgets: readonly DashboardWidget[]) =>
  updateDashboardLayoutInputSchema.safeParse({ revision: 0, widgets }).success;

describe('default layout', () => {
  it('is a valid layout of the contract', () => {
    expect(valid(DEFAULT_WIDGETS)).toBe(true);
    expect(layoutProblem(DEFAULT_WIDGETS)).toBeNull();
  });
});

describe('move', () => {
  const pair = [w('attention', 0, 0, 8, 4), w('system', 8, 0, 4, 4)];

  it('swaps with the neighbour on that side and keeps the layout valid', () => {
    const right = move(pair, 'attention', 'right');
    expect(at(right, 'attention')).toMatchObject({ x: 4, w: 8 });
    expect(at(right, 'system')).toMatchObject({ x: 0, w: 4 });
    expect(valid(right)).toBe(true);
    expect(sameLayout(move(right, 'attention', 'left'), pair)).toBe(true);
  });

  it('goes to the edge when nothing is in the way, and does nothing at the edge', () => {
    const lone = [w('today', 3, 0, 4, 3)];
    expect(at(move(lone, 'today', 'left'), 'today')?.x).toBe(0);
    expect(at(move(lone, 'today', 'right'), 'today')?.x).toBe(8);
    expect(sameLayout(move([w('today', 0, 0, 4, 3)], 'today', 'left'), [w('today', 0, 0, 4, 3)])).toBe(true);
  });

  it('moves down past the widget below and up again', () => {
    const column = [w('attention', 0, 0, 8, 4), w('today', 0, 4, 8, 4)];
    const down = move(column, 'attention', 'down');
    expect(at(down, 'today')?.y).toBe(0);
    expect(at(down, 'attention')?.y).toBe(4);
    expect(sameLayout(move(down, 'attention', 'up'), column)).toBe(true);
  });

  it('never leaves overlaps behind, whatever the neighbour sizes', () => {
    for (const direction of ['left', 'right', 'up', 'down'] as const) {
      for (const item of DEFAULT_WIDGETS) {
        expect(layoutProblem(move(DEFAULT_WIDGETS, item.id, direction))).toBeNull();
      }
    }
  });
});

describe('resize', () => {
  it('respects the widget minimum and the grid edge', () => {
    const small = [w('today', 0, 0, 4, 3)];
    expect(sameLayout(resize(small, 'today', 'narrower'), small)).toBe(true);
    expect(sameLayout(resize(small, 'today', 'shorter'), small)).toBe(true);
    expect(at(resize(small, 'today', 'wider'), 'today')?.w).toBe(5);
    const edge = [w('today', 8, 0, 4, 3)];
    expect(at(resize(edge, 'today', 'wider'), 'today')).toMatchObject({ x: 7, w: 5 });
  });

  it('pushes a neighbour down instead of overlapping it', () => {
    const next = resize([w('attention', 0, 0, 6, 4), w('system', 6, 0, 6, 4)], 'attention', 'wider');
    expect(layoutProblem(next)).toBeNull();
    expect(at(next, 'attention')?.w).toBe(7);
  });
});

describe('add and remove', () => {
  it('adds at the first free spot with the default size and refuses nothing it cannot place', () => {
    const next = add([w('attention', 0, 0, 8, 4)], 'upcoming');
    expect(at(next, 'upcoming')).toMatchObject({ x: 8, y: 0, w: 4, h: 4 });
    expect(valid(next)).toBe(true);
    const full = add([w('kpi-summary', 0, 0, 12, 2)], 'today');
    expect(at(full, 'today')).toMatchObject({ x: 0, y: 2, w: 8, h: 4 });
  });

  it('closes the gap a removed widget leaves, except in the phone order', () => {
    const column = [w('attention', 0, 0, 12, 2), w('today', 0, 2, 12, 2), w('recent', 0, 4, 12, 2)];
    expect(at(remove(column, 'today'), 'recent')?.y).toBe(2);
    expect(at(remove(column, 'today', true), 'recent')?.y).toBe(4);
  });
});

describe('phone order', () => {
  it('reads top to bottom, then left to right', () => {
    expect(sequence(DEFAULT_WIDGETS).map((item) => item.id)).toEqual([
      'kpi-summary',
      'attention',
      'system',
      'today',
      'upcoming',
      'recent',
      'drafts',
      'week',
      'quick-actions'
    ]);
  });

  it('reorders by re-flowing rows: sizes stay, the new order is exactly what a phone reads', () => {
    const order = ['today', 'kpi-summary', 'system', 'attention'];
    const widgets = [
      w('attention', 0, 0, 8, 4),
      w('system', 8, 0, 4, 4),
      w('today', 0, 4, 8, 4),
      w('kpi-summary', 0, 8, 12, 2)
    ];
    const next = reorderSequence(widgets, order);
    expect(sequence(next).map((item) => item.id)).toEqual(order);
    expect(valid(next)).toBe(true);
    expect(at(next, 'today')).toMatchObject({ x: 0, y: 0, w: 8, h: 4 });
    for (const original of widgets) expect(at(next, original.id)).toMatchObject({ w: original.w, h: original.h });
  });

  it('moves one place earlier or later and stays valid for the default layout', () => {
    for (const item of DEFAULT_WIDGETS) {
      for (const by of [-1, 1] as const) {
        const next = shiftInSequence(DEFAULT_WIDGETS, item.id, by);
        expect(layoutProblem(next)).toBeNull();
        const ids = sequence(DEFAULT_WIDGETS).map((entry) => entry.id);
        const from = ids.indexOf(item.id);
        const to = from + by;
        if (to >= 0 && to < ids.length) {
          ids.splice(to, 0, ...ids.splice(from, 1));
          expect(sequence(next).map((entry) => entry.id)).toEqual(ids);
        }
      }
    }
  });
});

describe('layoutProblem', () => {
  it('names what the server would refuse', () => {
    expect(layoutProblem([w('today', 8, 0, 6, 3)])).toBe('OUT_OF_GRID');
    expect(layoutProblem([w('today', 0, 0, 6, 3), w('upcoming', 3, 0, 4, 3)])).toBe('WIDGETS_OVERLAP');
    expect(layoutProblem([w('today', 0, 0, 6, 3), w('today', 6, 0, 4, 3)])).toBe('DUPLICATE_WIDGET_ID');
  });
});

describe('weekDays', () => {
  it('keeps empty days and counts by local day', () => {
    const now = new Date(2026, 9, 8, 10, 0);
    const days = weekDays(
      [
        { scheduledAt: new Date(2026, 9, 8, 18, 0).toISOString() },
        { scheduledAt: new Date(2026, 9, 8, 21, 0).toISOString() },
        { scheduledAt: new Date(2026, 9, 10, 9, 0).toISOString() },
        { scheduledAt: new Date(2026, 9, 20, 9, 0).toISOString() }
      ],
      now
    );
    expect(days.map((day) => day.count)).toEqual([2, 0, 1, 0, 0, 0, 0]);
    expect(days[0]?.isToday).toBe(true);
  });
});

describe('swap and drop', () => {
  it('swaps two widgets of equal size', () => {
    const pair = [w('today', 0, 0, 6, 4), w('upcoming', 6, 0, 6, 4)];
    const next = swap(pair, 'today', 'upcoming');
    expect(at(next, 'today')).toMatchObject({ x: 6, y: 0 });
    expect(at(next, 'upcoming')).toMatchObject({ x: 0, y: 0 });
  });

  it('swaps widgets of different sizes, pulling x left to fit, without overlaps', () => {
    const pair = [w('attention', 0, 0, 8, 4), w('system', 8, 0, 4, 4)];
    const next = swap(pair, 'attention', 'system');
    expect(at(next, 'attention')).toMatchObject({ x: 4, w: 8 });
    expect(at(next, 'system')).toMatchObject({ x: 0, w: 4 });
    expect(layoutProblem(next)).toBeNull();
  });

  it('finds the widget with the largest overlap as the drop target', () => {
    const items = [w('today', 0, 0, 6, 4), w('upcoming', 6, 0, 6, 4), w('recent', 0, 4, 12, 4)];
    expect(dropTarget(items, 'today', { x: 5, y: 0 })).toBe('upcoming');
    expect(dropTarget(items, 'today', { x: 0, y: 3 })).toBe('recent');
    expect(dropTarget(items, 'upcoming', { x: 6, y: 0 })).toBeUndefined();
  });

  it('a drop on free space moves the widget there; on a widget it swaps', () => {
    const items = [w('today', 0, 0, 4, 3), w('upcoming', 4, 0, 4, 3)];
    expect(at(dropAt(items, 'today', { x: 8, y: 0 }), 'today')).toMatchObject({ x: 8, y: 0 });
    const swapped = dropAt(items, 'today', { x: 4, y: 0 });
    expect(at(swapped, 'upcoming')).toMatchObject({ x: 0 });
    expect(at(swapped, 'today')).toMatchObject({ x: 4 });
  });

  it('never overlaps, whatever is swapped or dropped', () => {
    for (const a of DEFAULT_WIDGETS) {
      for (const b of DEFAULT_WIDGETS) {
        expect(layoutProblem(swap(DEFAULT_WIDGETS, a.id, b.id))).toBeNull();
        expect(layoutProblem(dropAt(DEFAULT_WIDGETS, a.id, { x: b.x, y: b.y }))).toBeNull();
      }
    }
  });

  it('a step swaps with the adjacent neighbour and names it', () => {
    const pair = [w('today', 0, 0, 6, 4), w('upcoming', 6, 0, 6, 4)];
    expect(moveStep(pair, 'today', 'right').partner).toBe('upcoming');
    expect(moveStep([w('today', 3, 0, 4, 3)], 'today', 'left').partner).toBeUndefined();
  });
});
