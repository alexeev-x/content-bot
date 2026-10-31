import { median } from './stats';

// The hour advice (area-backend-analytics.md §10.4): which hour of the day lands better, rubric-relative (a post
// against its own rubric's usual post, so a strong rubric in the evening does not make the evening look strong).
// Cells are shrunk toward their block of the day; a slot moves one hour at a time toward a better hour, never more
// than three hours from its default, only inside 08:00–22:30, at most every 14 days, and only for a gain of 10 %+.

export type HourGroup = 'wd' | 'we' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type HourPart = 'day' | 'evening';

export const DEFAULT_MINUTES: Record<HourPart, number> = { day: 12 * 60 + 30, evening: 19 * 60 };
const WEEKDAY_GROUPS: HourGroup[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const GROUP_MIN = 12;
const CELL_MIN = 3;
const PRIOR = 3;
const GAIN = Math.log(1.1);
const STEP = 60;
const MAX_SHIFT = 180;
const EARLIEST = 8 * 60;
const LATEST = 22 * 60 + 30;
const COOL_DOWN_MS = 14 * 86_400_000;
/** The two slots keep two hours between them (the scheduler's gap). */
const SLOT_GAP = 120;
const BLOCKS = [
  [8, 11],
  [12, 16],
  [17, 20],
  [21, 23]
] as const;

export interface HourPost {
  rubric: string;
  composite: number;
  /** Monday 0 … Sunday 6, Moscow. */
  weekday: number;
  hour: number;
}

export interface HourSlot {
  group: HourGroup;
  part: HourPart;
  minute: number;
  source: 'default' | 'learned' | 'manual';
  changedAt: number | null;
}

export interface HourProposal {
  group: HourGroup;
  part: HourPart;
  from: number;
  to: number;
  gain: number;
  n: number;
}

/** Each post against the median of its rubric's other posts; rubrics with fewer than three others are left out. */
export function relativeLogs(posts: readonly HourPost[]): (HourPost & { r: number })[] {
  return posts.flatMap((post) => {
    const others = posts.filter((each) => each.rubric === post.rubric && each !== post).map((each) => each.composite);
    if (others.length < 3) return [];
    const usual = median(others);
    if (usual === null || usual <= 0 || !(post.composite > 0)) return [];
    const r = Math.log(post.composite / usual);
    return Number.isFinite(r) ? [{ ...post, r }] : [];
  });
}

const inGroup = (group: HourGroup, weekday: number) =>
  group === 'wd' ? weekday <= 4 : group === 'we' ? weekday >= 5 : WEEKDAY_GROUPS[weekday] === group;

/** The groups the data supports: wd and we, plus a single weekday once it has twelve posts. */
export function hourGroups(posts: readonly { weekday: number }[]): HourGroup[] {
  const single = WEEKDAY_GROUPS.filter(
    (_, weekday) => posts.filter((post) => post.weekday === weekday).length >= GROUP_MIN
  );
  return ['wd', 'we', ...single];
}

/** A cell's shrunk estimate (log space) for each hour 8–22 of a group. */
export function cellEstimates(posts: readonly { hour: number; r: number }[]): Map<number, { est: number; n: number }> {
  const out = new Map<number, { est: number; n: number }>();
  for (const [from, to] of BLOCKS) {
    const block = posts.filter((post) => post.hour >= from && post.hour <= to);
    const blockEst = block.reduce((sum, post) => sum + post.r, 0) / (block.length + PRIOR);
    for (let hour = from; hour <= Math.min(to, 22); hour += 1) {
      const cell = posts.filter((post) => post.hour === hour);
      const sum = cell.reduce((total, post) => total + post.r, 0);
      out.set(hour, { est: (sum + PRIOR * blockEst) / (cell.length + PRIOR), n: cell.length });
    }
  }
  return out;
}

export function hourAdvice(posts: readonly HourPost[], slots: readonly HourSlot[], now: number): HourProposal[] {
  const relative = relativeLogs(posts);
  const proposals: HourProposal[] = [];
  for (const group of hourGroups(posts)) {
    const own = relative.filter((post) => inGroup(group, post.weekday));
    if (own.length < GROUP_MIN) continue;
    const cells = cellEstimates(own);
    for (const part of ['day', 'evening'] as const) {
      const slot = slots.find((each) => each.group === group && each.part === part);
      if (slot?.source === 'manual') continue;
      if (slot?.changedAt != null && now - slot.changedAt < COOL_DOWN_MS) continue;
      const fallback =
        group === 'wd' || group === 'we'
          ? undefined
          : slots.find(
              (each) => each.group === (WEEKDAY_GROUPS.indexOf(group) >= 5 ? 'we' : 'wd') && each.part === part
            );
      const minute = slot?.minute ?? fallback?.minute ?? DEFAULT_MINUTES[part];
      const current = cells.get(Math.floor(minute / 60));
      if (current === undefined) continue;
      const base = DEFAULT_MINUTES[part];
      let best: { hour: number; est: number; n: number } | null = null;
      for (const [hour, cell] of cells) {
        const candidate = hour * 60 + (minute % 60);
        if (cell.n < CELL_MIN || Math.abs(candidate - base) > MAX_SHIFT) continue;
        if (best === null || cell.est > best.est) best = { hour, ...cell };
      }
      if (best === null || best.est - current.est < GAIN) continue;
      const to = minute + (best.hour * 60 > minute ? STEP : -STEP);
      if (to < EARLIEST || to > LATEST || Math.abs(to - base) > MAX_SHIFT) continue;
      // The other part of the same group must stay two hours away.
      const other = part === 'day' ? 'evening' : 'day';
      const otherMinute =
        slots.find((each) => each.group === group && each.part === other)?.minute ?? DEFAULT_MINUTES[other];
      if (Math.abs(otherMinute - to) < SLOT_GAP) continue;
      proposals.push({ group, part, from: minute, to, gain: best.est - current.est, n: own.length });
    }
  }
  return proposals;
}
