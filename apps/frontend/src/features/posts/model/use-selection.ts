import { POST_BULK_MAX } from '@alexeev/contracts';
import { useState } from 'react';

export type SelectableRow = { id: string; revision: number };

type State = { scope: string; items: ReadonlyMap<string, number>; anchor: string | undefined };

const EMPTY: ReadonlyMap<string, number> = new Map();

/**
 * Selected posts with the revision the owner saw when selecting: a delete is only valid for that revision, so a
 * background refetch can never widen what a confirmed action removes. The selection survives pagination but is
 * dropped when `scope` (the tab) changes. Never more than one bulk request can hold (POST_BULK_MAX).
 */
export function useSelection(scope: string) {
  const [state, setState] = useState<State>({ scope, items: EMPTY, anchor: undefined });
  if (state.scope !== scope) setState({ scope, items: EMPTY, anchor: undefined });
  const items = state.scope === scope ? state.items : EMPTY;

  const update = (change: (items: Map<string, number>) => string | undefined) =>
    setState((prev) => {
      const next = new Map(prev.scope === scope ? prev.items : EMPTY);
      const anchor = change(next);
      return { scope, items: next, anchor: anchor ?? prev.anchor };
    });

  return {
    items,
    count: items.size,
    isFull: items.size >= POST_BULK_MAX,
    has: (id: string) => items.has(id),
    revisionOf: (id: string) => items.get(id),
    toggle(row: SelectableRow, on: boolean) {
      update((next) => {
        if (on) {
          if (next.size >= POST_BULK_MAX) return undefined;
          next.set(row.id, row.revision);
        } else next.delete(row.id);
        return row.id;
      });
    },
    /** Shift+click: everything between the last toggled row and this one, in the order shown. */
    selectRange(ordered: readonly SelectableRow[], to: SelectableRow) {
      update((next) => {
        const from = ordered.findIndex((row) => row.id === state.anchor);
        const end = ordered.findIndex((row) => row.id === to.id);
        const [start, stop] = from < 0 ? [end, end] : [Math.min(from, end), Math.max(from, end)];
        for (const row of ordered.slice(start, stop + 1)) {
          if (next.size >= POST_BULK_MAX) break;
          next.set(row.id, row.revision);
        }
        return to.id;
      });
    },
    setAll(rows: readonly SelectableRow[]) {
      update((next) => {
        for (const row of rows) {
          if (next.size >= POST_BULK_MAX) break;
          next.set(row.id, row.revision);
        }
        return undefined;
      });
    },
    setRevision(id: string, revision: number) {
      update((next) => {
        if (next.has(id)) next.set(id, revision);
        return undefined;
      });
    },
    remove(ids: readonly string[]) {
      update((next) => {
        for (const id of ids) next.delete(id);
        return undefined;
      });
    },
    clear: () => setState({ scope, items: EMPTY, anchor: undefined })
  };
}
