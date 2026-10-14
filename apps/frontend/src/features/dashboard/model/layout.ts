/** The widgets of Обзор. */
export type WidgetKind = 'today' | 'week' | 'drafts';

/** Column spans on the 12-column grid of a wide screen. */
export type WidgetWidth = 6 | 12;

export type LayoutItem = { id: WidgetKind; w: WidgetWidth };

/** The one Обзор layout in reading order (owner, 14.10.2026: no customisation). */
export const LAYOUT: readonly LayoutItem[] = [
  { id: 'today', w: 12 },
  { id: 'week', w: 6 },
  { id: 'drafts', w: 6 }
];
