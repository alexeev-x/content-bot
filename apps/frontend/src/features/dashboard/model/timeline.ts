import type { DashboardPublicationDto } from '@alexeev/contracts';

export type Marker<T = DashboardPublicationDto> = { item: T; percent: number; lane: number };

/** Position of an instant inside its owner-zone day, 0..100 (a 23 or 25 hour day still spans the whole track). */
export function dayPercent(iso: string | number, day: { from: string; to: string }): number {
  const from = Date.parse(day.from);
  const span = Date.parse(day.to) - from;
  const at = typeof iso === 'number' ? iso : Date.parse(iso);
  return Math.min(100, Math.max(0, ((at - from) / span) * 100));
}

/**
 * Markers sorted by time. Neighbours closer than `gap` percent drop into the next lane so two sends scheduled
 * minutes apart stay separate, focusable targets.
 */
export function placeMarkers<T extends { scheduledAt: string }>(
  items: readonly T[],
  day: { from: string; to: string },
  gap: number,
  lanes: number
): Marker<T>[] {
  const sorted = [...items].sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const lastInLane: number[] = [];
  return sorted.map((item) => {
    const percent = dayPercent(item.scheduledAt, day);
    let lane = lastInLane.findIndex((last) => percent - last >= gap);
    if (lane === -1) lane = lastInLane.length < lanes ? lastInLane.length : lastInLane.indexOf(Math.min(...lastInLane));
    lastInLane[lane] = percent;
    return { item, percent, lane };
  });
}
