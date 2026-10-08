import { dashboardLayoutSchema, dashboardWidgetTypeSchema, updateDashboardLayoutInputSchema } from '@alexeev/contracts';
import { describe, expect, it } from 'vitest';

const widget = (id: string, x: number, y: number, w: number, h: number) => ({ id, type: 'today', x, y, w, h });

describe('dashboard layout contract', () => {
  it('lists the fifteen widget types', () => {
    expect(dashboardWidgetTypeSchema.options).toEqual([
      'kpi-summary',
      'kpi-today',
      'kpi-sent',
      'kpi-attention',
      'kpi-next',
      'attention',
      'today',
      'upcoming',
      'recent',
      'drafts',
      'week',
      'channels',
      'incidents',
      'system',
      'quick-actions'
    ]);
  });

  it('accepts the never-saved answer', () => {
    expect(dashboardLayoutSchema.safeParse({ revision: 0, widgets: [] }).success).toBe(true);
  });

  it('accepts a request and a response of the same shape', () => {
    const body = { revision: 2, widgets: [widget('a', 0, 0, 6, 2), widget('b', 6, 0, 6, 2)] };

    expect(updateDashboardLayoutInputSchema.parse(body)).toEqual(body);
    expect(dashboardLayoutSchema.parse(body)).toEqual(body);
  });

  it('rejects unknown keys in the request', () => {
    expect(updateDashboardLayoutInputSchema.safeParse({ revision: 0, widgets: [], extra: 1 }).success).toBe(false);
  });

  it.each([
    ['rectangles that share cells', [widget('a', 0, 0, 4, 4), widget('b', 2, 2, 4, 4)]],
    ['one rectangle inside another', [widget('a', 0, 0, 12, 12), widget('b', 3, 3, 1, 1)]],
    ['the same id twice', [widget('a', 0, 0, 1, 1), widget('a', 5, 5, 1, 1)]],
    ['a widget past the right edge', [widget('a', 11, 0, 2, 1)]]
  ])('rejects %s', (_name, widgets) => {
    expect(dashboardLayoutSchema.safeParse({ revision: 0, widgets }).success).toBe(false);
  });

  it.each([
    ['side by side', [widget('a', 0, 0, 4, 2), widget('b', 4, 0, 4, 2)]],
    ['stacked', [widget('a', 0, 0, 4, 2), widget('b', 0, 2, 4, 2)]],
    ['the full width', [widget('a', 0, 0, 12, 1)]]
  ])('accepts widgets %s', (_name, widgets) => {
    expect(dashboardLayoutSchema.safeParse({ revision: 0, widgets }).success).toBe(true);
  });
});
