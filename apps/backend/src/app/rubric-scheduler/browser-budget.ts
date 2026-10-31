import { fromMsk, mskParts } from '../../shared/msk-time';
import type { SlotRepository } from '../../modules/rubric-scheduler';
import type { SchedulerEnv, SchedulerMode } from './runtime';

// Browser Rendering's daily cap for the rubrics (MASTER-PLAN stage P): Workers Paid includes 10 browser hours a month,
// then $0.09 an hour (price page checked 31.10.2026). 12 minutes a day on production (~6 h a month) and 4 on DEV keep
// it inside the included hours. Counted from the builds' own measured screenshot time of the Moscow day.

const DAY_MS = 86_400_000;
const DEFAULT_CAP_MS = { live: 12 * 60_000, rehearsal: 4 * 60_000 } as const;

export function browserCapMs(env: SchedulerEnv, mode: SchedulerMode): number {
  const configured = Number(env.BROWSER_DAILY_CAP_MS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return mode === 'rehearsal' ? DEFAULT_CAP_MS.rehearsal : DEFAULT_CAP_MS.live;
}

/** The browser time the Moscow day's builds used so far. */
export async function browserUsedToday(slots: Pick<SlotRepository, 'between'>, now: number): Promise<number> {
  const start = fromMsk(mskParts(now).day, 0);
  return (await slots.between(start, start + DAY_MS)).reduce((sum, slot) => sum + (slot.build?.browserMs ?? 0), 0);
}
