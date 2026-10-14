// Grid geometry of the fixed Обзор layout; GAP equals --space-4.
export const ROW_HEIGHT = 56;
export const GAP = 16;
/** The phone layout: the single breakpoint of the shell (tab bar, one column). */
export const PHONE_QUERY = '(max-width: 859px)';

/** The quiet panel header strip (--size-row on a mouse device). */
const PANEL_HEAD = 48;

/** Height in px of a widget `h` rows tall. */
const cellHeight = (h: number): number => h * ROW_HEIGHT + (h - 1) * GAP;

/** How many rows of `rowPx` fit in a widget `h` rows tall under the panel header and `extra` px of other chrome. */
export function rowCapacity(h: number, rowPx: number, extra = 0): number {
  return Math.max(1, Math.floor((cellHeight(h) - PANEL_HEAD - extra) / rowPx));
}
