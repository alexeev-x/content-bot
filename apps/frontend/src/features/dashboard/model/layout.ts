/** The widgets of Обзор. */
export type WidgetKind =
  | 'today'
  | 'nextPublication'
  | 'week'
  | 'latestYoutube'
  | 'latestTiktok'
  | 'trending'
  | 'crossPlatform'
  | 'contentInWork'
  | 'sources';

/** Column spans on the 12-column grid of a wide screen. */
export type WidgetWidth = 6 | 12;

export type LayoutItem = { id: WidgetKind; w: WidgetWidth };

/** The one Обзор layout in reading order (owner, 14.10.2026: no customisation; widgets from design-refs/обзор). */
export const LAYOUT: readonly LayoutItem[] = [
  { id: 'today', w: 12 },
  { id: 'nextPublication', w: 6 },
  { id: 'week', w: 6 },
  { id: 'latestYoutube', w: 6 },
  { id: 'latestTiktok', w: 6 },
  { id: 'trending', w: 6 },
  { id: 'crossPlatform', w: 6 },
  { id: 'contentInWork', w: 6 },
  { id: 'sources', w: 6 }
];
