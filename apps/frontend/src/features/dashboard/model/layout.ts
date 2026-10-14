/** The widgets of Обзор. */
export type WidgetKind = 'today' | 'upcoming' | 'week' | 'drafts' | 'recent' | 'activity' | 'system';

/** Column spans on the 12-column grid of a wide screen. */
export type WidgetWidth = 4 | 8 | 12;

export type LayoutItem = { id: WidgetKind; w: WidgetWidth };

/** The one Обзор layout in reading order (owner, 14.10.2026: no customisation). */
export const LAYOUT: readonly LayoutItem[] = [
  { id: 'today', w: 8 },
  { id: 'upcoming', w: 4 },
  { id: 'week', w: 4 },
  { id: 'drafts', w: 4 },
  { id: 'recent', w: 4 },
  { id: 'activity', w: 8 },
  { id: 'system', w: 4 }
];

/** The span on a medium screen (760–999 px): narrow widgets pair up, wide ones take the row. */
export function mediumSpan(w: WidgetWidth): number {
  return w >= 8 ? 12 : 6;
}
