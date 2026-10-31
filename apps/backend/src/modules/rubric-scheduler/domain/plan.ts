import { addMskDays, fromMsk, minuteOf, mskParts, mskWeekday } from '../../../shared/msk-time';
import { type ConstraintContext, fitsSlot, violations } from './constraints';
import type { ChannelPost, ForecastSlot, Need, RubricDescriptor, Weight } from './types';

// The scheduler's plan of pool rubrics and weekly anchors over Moscow days (docs/scheduler/area-backend-core.md §5):
// base slots 12:30 and 19:00 with a stable jitter of ±20 minutes, a morning slot at 08:00 for the rubrics that keep
// that hour, the evening placed first and the day slot only when a rested candidate fits. An empty slot is normal.
// Pure: the same input always gives the same plan.

const DAY_MS = 86_400_000;
const DAY_SLOT = 12 * 60 + 30;
const EVENING_SLOT = 19 * 60;
const MORNING_SLOT = 8 * 60;
const JITTER_MINUTES = 20;
/** The pool's weekly capacity (release-model 10.4): the first run spreads the rubrics over it. */
const POOL_PER_WEEK = 10;

/** A stable 32-bit hash (FNV-1a): jitter and ties never depend on the run. */
export function stableHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface PlanInput {
  now: number;
  days: number;
  rubrics: RubricDescriptor[];
  /** When each rubric last went out; missing: never (the start-up seed spreads them). */
  lastSent: Readonly<Record<string, number | undefined>>;
  /** Every channel post known, ours and the news, past and planned. */
  channel: ChannelPost[];
  capabilities: ReadonlySet<Need>;
  /** The latest patch with hero changes: the rubrics with old numbers stay quiet after it. */
  lastHeroPatchAt: number | null;
  /** The Monday (MSK `YYYY-MM-DD`) the horoscope's every-other-week rhythm counts from. */
  horoscopeAnchorWeek: string | null;
}

export interface Ineligible {
  rubric: string;
  missing: Need[];
}

/** Whether the rubric can run here at all: its needs against the capabilities. */
export function missingNeeds(rubric: RubricDescriptor, capabilities: ReadonlySet<Need>): Need[] {
  return rubric.needs.filter((need) => !capabilities.has(need));
}

/**
 * The start-up seed (§13): with no history every pool rubric would be due at once, so each gets a «last post» that
 * spreads them over the first weeks in a stable order.
 */
export function seedLastSent(rubrics: RubricDescriptor[], now: number): Record<string, number> {
  const pool = rubrics
    .filter((rubric) => rubric.trigger === 'pool' && rubric.restDays !== null)
    .sort((a, b) => stableHash(a.key) - stableHash(b.key) || a.key.localeCompare(b.key));
  const seeded: Record<string, number> = {};
  pool.forEach((rubric, index) => {
    const rest = rubric.restDays ?? 7;
    const offset = Math.min(index * (7 / POOL_PER_WEEK), rest - 1);
    seeded[rubric.key] = now - (rest - offset) * DAY_MS;
  });
  return seeded;
}

const weightOf = (rubric: RubricDescriptor): Weight => (rubric.weight === 'L' ? 'L' : 'V');

function jittered(day: string, base: number, slotNo: number): number {
  const spread = 2 * JITTER_MINUTES + 1;
  return base - JITTER_MINUTES + (stableHash(`${day}:${slotNo}`) % spread);
}

/** The minute a rubric takes inside a slot: its own window clamps the slot's time. */
function minuteFor(rubric: RubricDescriptor, slotMinute: number): number {
  const slot = rubric.slot;
  if (typeof slot !== 'object') return slotMinute;
  if ('exactMsk' in slot) return minuteOf(slot.exactMsk);
  return Math.min(Math.max(slotMinute, minuteOf(slot.fromMsk)), minuteOf(slot.toMsk));
}

function isHoroscopeWeek(day: string, anchorWeek: string | null): boolean {
  if (anchorWeek === null) return false;
  const weeks = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${anchorWeek}T00:00:00Z`)) / (7 * DAY_MS));
  return weeks >= 0 && weeks % 2 === 0;
}

/** The forecast of the next `days` Moscow days, today included (slots already past are left out). */
export function plan(input: PlanInput): { slots: ForecastSlot[]; ineligible: Ineligible[] } {
  const byKey = new Map(input.rubrics.map((rubric) => [rubric.key, rubric]));
  const context: ConstraintContext = { rubrics: byKey };
  const seeded = seedLastSent(input.rubrics, input.now);
  const last: Record<string, number> = { ...seeded };
  for (const [key, at] of Object.entries(input.lastSent)) if (at !== undefined) last[key] = at;
  const ineligible = input.rubrics
    .map((rubric) => ({ rubric: rubric.key, missing: missingNeeds(rubric, input.capabilities) }))
    .filter((each) => each.missing.length > 0);
  const runnable = input.rubrics.filter((rubric) => missingNeeds(rubric, input.capabilities).length === 0);
  const occupants: ChannelPost[] = [...input.channel];
  const slots: ForecastSlot[] = [];
  const today = mskParts(input.now).day;

  const place = (rubric: RubricDescriptor, at: number, kind: 'rest' | 'anchor', text: string) => {
    occupants.push({
      at,
      weight: weightOf(rubric),
      rubric: rubric.key,
      interactive: rubric.interactive,
      family: rubric.family
    });
    last[rubric.key] = at;
    slots.push({
      rubric: rubric.key,
      at,
      reason: { kind, text },
      hasPicture: rubric.hasPicture,
      hasPoll: rubric.hasPoll
    });
  };

  const quiet = (rubric: RubricDescriptor, at: number) =>
    rubric.silentAfterPatchDays !== null &&
    input.lastHeroPatchAt !== null &&
    at >= input.lastHeroPatchAt &&
    at < input.lastHeroPatchAt + rubric.silentAfterPatchDays * DAY_MS;

  const fits = (rubric: RubricDescriptor, at: number, anchor = false) =>
    at > input.now &&
    !quiet(rubric, at) &&
    violations(
      { at, weight: weightOf(rubric), rubric: rubric.key, interactive: rubric.interactive, family: rubric.family },
      occupants,
      { ...context, anchor }
    ).length === 0;

  for (let offset = 0; offset < input.days; offset += 1) {
    const day = addMskDays(today, offset);
    const weekday = mskWeekday(fromMsk(day, 12 * 60));

    // Anchors first: the horoscope on Monday 08:00 every other week (owner, 29.10.2026).
    const horoscope = runnable.find((rubric) => rubric.trigger === 'anchor');
    if (horoscope !== undefined && weekday === 1 && isHoroscopeWeek(day, input.horoscopeAnchorWeek)) {
      const at = fromMsk(day, minuteFor(horoscope, MORNING_SLOT));
      if (fits(horoscope, at, true)) place(horoscope, at, 'anchor', 'Понедельник через неделю, 08:00');
    }

    const parts: { part: 'morning' | 'day' | 'evening'; minute: number }[] = [
      { part: 'evening', minute: jittered(day, EVENING_SLOT, 2) },
      { part: 'day', minute: jittered(day, DAY_SLOT, 1) },
      { part: 'morning', minute: MORNING_SLOT }
    ];
    // The day's slots are filled most overdue first, whichever slot that rubric fits: a rubric that only takes the day
    // slot is not starved by the evening always going first.
    const open = [...parts];
    while (open.length > 0) {
      const candidates = open
        .flatMap(({ part, minute }) =>
          runnable
            .filter((rubric) => rubric.trigger === 'pool' && rubric.restDays !== null)
            .map((rubric) => {
              const at = fromMsk(day, minuteFor(rubric, minute));
              const since = (at - (last[rubric.key] ?? 0)) / DAY_MS;
              return { rubric, part, at, ratio: since / (rubric.restDays ?? 1), since };
            })
        )
        .filter(({ rubric, at, part, ratio }) => ratio >= 1 && fitsSlot(rubric, at, part) && fits(rubric, at))
        // The most overdue first, then the longest wait, then the evening, then a stable hash.
        .sort(
          (a, b) =>
            b.ratio - a.ratio ||
            b.since - a.since ||
            parts.findIndex((each) => each.part === a.part) - parts.findIndex((each) => each.part === b.part) ||
            stableHash(`${day}:${a.rubric.key}`) - stableHash(`${day}:${b.rubric.key}`)
        );
      const chosen = candidates[0];
      if (chosen === undefined) break;
      place(chosen.rubric, chosen.at, 'rest', `Отдых ${chosen.rubric.restDays ?? 0} дн. прошёл`);
      open.splice(
        open.findIndex((each) => each.part === chosen.part),
        1
      );
    }
  }
  slots.sort((a, b) => a.at - b.at);
  return { slots, ineligible };
}
