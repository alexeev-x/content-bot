import type { DashboardWidget } from '@alexeev/contracts';

/** What Обзор shows until the owner saves a layout (revision 0): the former arrangement plus the new widgets. */
export const DEFAULT_WIDGETS: readonly DashboardWidget[] = [
  { id: 'kpi-summary', type: 'kpi-summary', x: 0, y: 0, w: 12, h: 2 },
  { id: 'attention', type: 'attention', x: 0, y: 2, w: 8, h: 4 },
  { id: 'system', type: 'system', x: 8, y: 2, w: 4, h: 4 },
  { id: 'today', type: 'today', x: 0, y: 6, w: 8, h: 4 },
  { id: 'upcoming', type: 'upcoming', x: 8, y: 6, w: 4, h: 4 },
  { id: 'recent', type: 'recent', x: 0, y: 10, w: 8, h: 4 },
  { id: 'drafts', type: 'drafts', x: 8, y: 10, w: 4, h: 5 },
  { id: 'week', type: 'week', x: 0, y: 14, w: 8, h: 3 },
  { id: 'quick-actions', type: 'quick-actions', x: 8, y: 15, w: 4, h: 3 }
];
