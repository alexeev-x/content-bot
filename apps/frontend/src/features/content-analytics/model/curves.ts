import type { ContentBaselineDto, ContentItemDetailDto } from '@alexeev/contracts';

const HOUR = 3_600_000;

/** The item's views by hours since publishing, from its snapshots, starting at 0. */
export function ageCurve(detail: ContentItemDetailDto, maxHours?: number): { x: number; y: number }[] {
  const published = Date.parse(detail.item.publishedAt);
  const points = detail.snapshots
    .filter((snapshot) => snapshot.views !== null)
    .map((snapshot) => ({ x: (Date.parse(snapshot.observedAt) - published) / HOUR, y: snapshot.views ?? 0 }))
    .filter((point) => point.x >= 0 && (maxHours === undefined || point.x <= maxHours));
  return points.length > 0 ? [{ x: 0, y: 0 }, ...points] : [];
}

/** The usual curve as points from 0, cut at `maxHours`. */
export function baselineCurve(baseline: ContentBaselineDto | undefined, maxHours = 72): { x: number; y: number }[] {
  const points = (baseline?.points ?? []).filter((point) => point.ageHours <= maxHours);
  return points.length > 0 ? [{ x: 0, y: 0 }, ...points.map((point) => ({ x: point.ageHours, y: point.views }))] : [];
}

/** The usual p25–p75 range at each checkpoint, from 0, cut at `maxHours`; empty for an older baseline. */
export function baselineBand(
  baseline: ContentBaselineDto | undefined,
  maxHours = 72
): { x: number; low: number; high: number }[] {
  const points = (baseline?.points ?? []).filter(
    (point) => point.ageHours <= maxHours && point.low !== undefined && point.high !== undefined
  );
  return points.length > 0
    ? [{ x: 0, low: 0, high: 0 }, ...points.map((point) => ({ x: point.ageHours, low: point.low!, high: point.high! }))]
    : [];
}

/** «0», «30 мин», «1,5 ч», «12 ч», «4 дн»: axis ticks of a young item stay distinct. */
export function formatAge(hours: number): string {
  if (hours <= 0) return '0';
  if (hours < 1) return `${Math.round(hours * 60)} мин`;
  if (hours < 10) return `${(Math.round(hours * 10) / 10).toLocaleString('ru-RU')} ч`;
  if (hours < 72) return `${Math.round(hours)} ч`;
  return `${Math.round(hours / 24)} дн`;
}

/** The growth range that shows a whole item: 24 h while it is younger than a day, then 72 h, then all. */
export function rangeForAge(hours: number): '24' | '72' | 'all' {
  return hours < 24 ? '24' : hours < 72 ? '72' : 'all';
}
