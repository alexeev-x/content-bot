import { z } from 'zod';

// The owner's customizable Обзор widget grid (owner decision 08.10.2026), stored on the server so the
// browser and the Mini App show the same layout. A 12-column grid; a widget that is not in the list
// is removed from the page.

export const DASHBOARD_GRID_COLUMNS = 12;
export const DASHBOARD_WIDGETS_MAX = 40;
export const DASHBOARD_WIDGET_ID_MAX = 40;
export const DASHBOARD_GRID_MAX_ROW = 199;
export const DASHBOARD_WIDGET_MAX_HEIGHT = 12;

// Analytics, top posts, Dota Pulse, sources, automations and media are not widget types yet; adding
// one later is an additive contract change.
export const dashboardWidgetTypeSchema = z.enum([
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
export type DashboardWidgetType = z.infer<typeof dashboardWidgetTypeSchema>;

// Cells: x is the column (0 is the left edge), y the row, w and h the size in columns and rows.
export const dashboardWidgetSchema = z
  .strictObject({
    id: z
      .string()
      .min(1)
      .max(DASHBOARD_WIDGET_ID_MAX)
      .regex(/^[a-z0-9-]+$/, { error: 'Use lowercase letters, digits and hyphens' }),
    type: dashboardWidgetTypeSchema,
    x: z
      .number()
      .int()
      .min(0)
      .max(DASHBOARD_GRID_COLUMNS - 1),
    y: z.number().int().min(0).max(DASHBOARD_GRID_MAX_ROW),
    w: z.number().int().min(1).max(DASHBOARD_GRID_COLUMNS),
    h: z.number().int().min(1).max(DASHBOARD_WIDGET_MAX_HEIGHT)
  })
  .refine((widget) => widget.x + widget.w <= DASHBOARD_GRID_COLUMNS, {
    error: 'OUT_OF_GRID',
    path: ['w']
  });
export type DashboardWidget = z.infer<typeof dashboardWidgetSchema>;

const widgetsSchema = z
  .array(dashboardWidgetSchema)
  .max(DASHBOARD_WIDGETS_MAX)
  .superRefine((widgets, ctx) => {
    if (new Set(widgets.map((widget) => widget.id)).size !== widgets.length) {
      ctx.addIssue({ code: 'custom', message: 'DUPLICATE_WIDGET_ID' });
    }
    const overlaps = widgets.some((a, i) =>
      widgets.slice(i + 1).some((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
    );
    if (overlaps) ctx.addIssue({ code: 'custom', message: 'WIDGETS_OVERLAP' });
  });

/** Machine-readable reasons raised by the refinements above (`details.reason` of a 400). */
export const DASHBOARD_LAYOUT_REASONS = ['DUPLICATE_WIDGET_ID', 'WIDGETS_OVERLAP', 'OUT_OF_GRID'] as const;

export const dashboardLayoutSchema = z.object({
  /** 0 while the owner has never saved: `widgets` is then empty and the client applies its default layout. */
  revision: z.number().int().nonnegative(),
  widgets: widgetsSchema
});
export type DashboardLayoutDto = z.infer<typeof dashboardLayoutSchema>;

// GET /api/v1/settings/dashboard-layout → 200 DashboardLayoutDto. Never saved → { revision: 0,
// widgets: [] }; the client then shows its own default layout. After the first save an empty
// `widgets` is a real choice (the owner removed everything) and is not replaced by the default.
// Errors: UNAUTHORIZED 401, FORBIDDEN 403.
//
// PUT /api/v1/settings/dashboard-layout → 200 DashboardLayoutDto with revision + 1. Replaces the whole
// layout; the current revision travels in the body.
// Errors: VALIDATION_ERROR 400 (details.reason OUT_OF_GRID, DUPLICATE_WIDGET_ID, WIDGETS_OVERLAP) or
// 413 (body over 8 KB), CONFLICT 409 (details.reason STALE_REVISION), UNAUTHORIZED 401, FORBIDDEN 403.
export const updateDashboardLayoutInputSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  widgets: widgetsSchema
});
export type UpdateDashboardLayoutInput = z.infer<typeof updateDashboardLayoutInputSchema>;
