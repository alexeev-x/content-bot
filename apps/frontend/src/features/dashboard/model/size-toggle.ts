import type { DashboardWidget } from '@alexeev/contracts';
import { WIDGETS, type WidgetSize } from './widget-catalog';

const KEY = 'ui-dashboard-large-sizes';

/** A widget at its minimum size is «small»; anything bigger is «large». */
export const isSmall = (widget: DashboardWidget): boolean => {
  const { min } = WIDGETS[widget.type];
  return widget.w <= min.w && widget.h <= min.h;
};

function readAll(): Record<string, WidgetSize> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, WidgetSize>) : {};
  } catch {
    return {};
  }
}

/** The size the owner had before collapsing this widget type (a per-viewer convenience), if still valid. */
function remembered(widget: DashboardWidget): WidgetSize | undefined {
  const size = readAll()[widget.type];
  const { min } = WIDGETS[widget.type];
  return size && Number.isInteger(size.w) && Number.isInteger(size.h) && size.w >= min.w && size.h >= min.h
    ? size
    : undefined;
}

/** Where the toggle goes: small -> the last large size (else the type's default); large -> the minimum. */
export function toggleTarget(widget: DashboardWidget): WidgetSize {
  const def = WIDGETS[widget.type];
  if (!isSmall(widget)) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [widget.type]: { w: widget.w, h: widget.h } }));
    } catch {
      // Not remembered: the next expand uses the default size.
    }
    return def.min;
  }
  const last = remembered(widget);
  return last && !(last.w <= def.min.w && last.h <= def.min.h) ? last : def.size;
}
