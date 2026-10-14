export type FixedWidgetType = 'kpi-summary' | 'attention' | 'today' | 'upcoming' | 'recent' | 'system';
export type FixedWidget = { type: FixedWidgetType; x: number; y: number; w: number; h: number };

/** The Обзор layout: 12 columns, listed in reading order (a phone stacks them in this order). */
export const FIXED_WIDGETS: readonly FixedWidget[] = [
  { type: 'kpi-summary', x: 0, y: 0, w: 12, h: 2 },
  { type: 'attention', x: 0, y: 2, w: 8, h: 4 },
  { type: 'today', x: 0, y: 6, w: 8, h: 4 },
  { type: 'upcoming', x: 0, y: 10, w: 4, h: 4 },
  { type: 'recent', x: 4, y: 10, w: 4, h: 4 },
  { type: 'system', x: 8, y: 10, w: 4, h: 4 }
];
