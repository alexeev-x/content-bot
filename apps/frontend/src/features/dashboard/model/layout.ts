/** The widgets of Обзор. */
export type WidgetKind =
  'today' | 'ai' | 'nextPublication' | 'dota' | 'week' | 'latestYoutube' | 'latestTiktok' | 'trending' | 'sources';

/** Column spans on the 12-column grid of a wide screen. */
export type WidgetWidth = 4 | 6 | 8 | 12;

export type LayoutItem = { id: WidgetKind; w: WidgetWidth };

/** The one Обзор layout in reading order (owner, 14.10.2026: no customisation; widgets from design-refs/обзор). */
export const LAYOUT: readonly LayoutItem[] = [
  // «ИИ расходы» beside the day's timeline (owner, 16.10.2026, design-refs).
  { id: 'today', w: 8 },
  { id: 'ai', w: 4 },
  // «Дота» beside them (owner, 16.10.2026: rank and neat stats on the main page).
  { id: 'nextPublication', w: 4 },
  { id: 'week', w: 4 },
  { id: 'dota', w: 4 },
  { id: 'latestYoutube', w: 6 },
  { id: 'latestTiktok', w: 6 },
  { id: 'trending', w: 6 },
  { id: 'sources', w: 6 }
];
