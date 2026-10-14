// One source for the grid geometry: the CSS grid of the view mode and react-grid-layout in the edit mode both
// take these numbers, so a widget has the same box in both and nothing jumps when the owner starts editing.
// (react-grid-layout needs pixels, so they cannot be CSS tokens; GAP equals --space-4.)
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
