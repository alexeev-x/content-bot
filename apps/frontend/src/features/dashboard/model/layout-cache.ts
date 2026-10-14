import { dashboardLayoutSchema, type DashboardLayoutDto } from '@alexeev/contracts';

// A per-viewer convenience copy of the last saved layout, so the skeleton and the first paint already have the
// owner's geometry. It holds no secret and is never trusted: the server copy replaces it as soon as it arrives.
const KEY = 'ui-dashboard-layout';

/** The cached layout, or null when storage is blocked, empty or holds anything the contract would not accept. */
export function readCachedLayout(): DashboardLayoutDto | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = dashboardLayoutSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.revision > 0 ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Stores a saved layout; revision 0 means the owner never saved, so the copy is dropped. */
export function writeCachedLayout(layout: DashboardLayoutDto): void {
  try {
    if (layout.revision === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // Not persisted: the next visit simply starts from the server copy.
  }
}
