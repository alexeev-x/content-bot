import type { ContentBaselineDto, ContentItemDto, ContentPlatform } from '@alexeev/contracts';

// «Залетает» compares a young item with the platform's usual curve at the same age (views at 1, 3, 6 …
// 72 hours of the items tracked from birth); an older one with the median of its platform in the period.

export type ItemStatus = 'rising' | 'normal' | 'below' | 'collecting';
export type ItemVerdict = {
  status: ItemStatus;
  /** Views against the usual; null while collecting. */
  multiple: number | null;
  /** `age`: against the usual curve at the item's age; `final`: against the period median. */
  basis: 'age' | 'final' | null;
  /** The usual value the item was compared with. */
  usual: number | null;
};

const HOUR = 3_600_000;
export const YOUNG_HOURS = 72;
export const RISING = 1.5;
export const BELOW = 0.7;

/** The usual views at `ageHours`, interpolated between checkpoints; null outside the measured range. */
export function usualAt(baseline: ContentBaselineDto | undefined, ageHours: number): number | null {
  const points = baseline?.points ?? [];
  if (points.length === 0) return null;
  const first = points[0]!;
  const last = points.at(-1)!;
  if (ageHours < first.ageHours) return null;
  // A little past the last checkpoint still compares fairly; much later does not.
  if (ageHours >= last.ageHours) return ageHours <= last.ageHours * 1.1 ? last.views : null;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    if (ageHours <= b.ageHours)
      return a.views + ((b.views - a.views) * (ageHours - a.ageHours)) / (b.ageHours - a.ageHours);
  }
  return null;
}

function classify(multiple: number): ItemStatus {
  return multiple >= RISING ? 'rising' : multiple <= BELOW ? 'below' : 'normal';
}

export function verdictFor(
  item: ContentItemDto,
  now: number,
  baselines: readonly ContentBaselineDto[],
  medians: Partial<Record<ContentPlatform, number | null>>
): ItemVerdict {
  const collecting: ItemVerdict = { status: 'collecting', multiple: null, basis: null, usual: null };
  if (item.views === null) return collecting;
  const ageHours = (now - Date.parse(item.publishedAt)) / HOUR;
  if (ageHours < YOUNG_HOURS) {
    const usual = usualAt(
      baselines.find((entry) => entry.platform === item.platform),
      ageHours
    );
    if (usual === null || usual <= 0) return collecting;
    const multiple = Math.round((item.views / usual) * 10) / 10;
    return { status: classify(multiple), multiple, basis: 'age', usual: Math.round(usual) };
  }
  const usual = medians[item.platform] ?? null;
  if (usual === null || usual <= 0) return collecting;
  const multiple = Math.round((item.views / usual) * 10) / 10;
  return { status: classify(multiple), multiple, basis: 'final', usual };
}

/** Where the item stands among its platform's items of the period: 1 is the most viewed. */
export function rankOf(
  item: ContentItemDto,
  items: readonly ContentItemDto[]
): { position: number; total: number; topPercent: number } | null {
  const own = items
    .filter((entry) => entry.platform === item.platform && entry.views !== null)
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  const position = own.findIndex((entry) => entry.id === item.id) + 1;
  if (position === 0) return null;
  return { position, total: own.length, topPercent: Math.max(1, Math.round((position / own.length) * 100)) };
}
