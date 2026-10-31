import { shrunk } from './stats';

// The rest advice (area-backend-analytics.md §10.3): a pool rubric that lands better than the channel's usual post
// comes more often, a weaker one rarer. The mean of its last scores' logs, shrunk toward ×1 by three pseudo-posts, must
// leave the dead zone 0.85–1.15; the step is 10 % of the rest (1–5 days), the rest stays inside 7–60, a rubric changes
// at most every 14 days, at most three changes a week.

export const REST_MIN = 7;
export const REST_MAX = 60;
const MIN_POSTS = 4;
const LAST_POSTS = 8;
const COOL_DOWN_MS = 14 * 86_400_000;
const PER_RUN = 3;
const BETTER = 1.15;
const WORSE = 0.85;

export interface RestSubject {
  rubric: string;
  restDays: number;
  source: 'default' | 'manual' | 'learned';
  /** The last learned change (applied), or null. */
  lastChangeAt: number | null;
  /** Its main posts' composites, newest first. */
  composites: readonly number[];
}

export interface RestProposal {
  rubric: string;
  from: number;
  to: number;
  reason: 'better' | 'worse';
  xs: number;
  n: number;
}

export function restAdvice(subjects: readonly RestSubject[], now: number): RestProposal[] {
  const proposals: RestProposal[] = [];
  for (const subject of subjects) {
    if (subject.source === 'manual') continue;
    if (subject.lastChangeAt !== null && now - subject.lastChangeAt < COOL_DOWN_MS) continue;
    const logs = subject.composites
      .slice(0, LAST_POSTS)
      .filter((x) => Number.isFinite(x) && x > 0)
      .map((x) => Math.log(x));
    if (logs.length < MIN_POSTS) continue;
    const xs = shrunk(logs);
    if (xs === null || (xs > WORSE && xs < BETTER)) continue;
    const rest = Math.min(Math.max(Math.round(subject.restDays), REST_MIN), REST_MAX);
    const step = Math.min(Math.max(Math.round(rest * 0.1), 1), 5);
    const to = Math.min(Math.max(xs >= BETTER ? rest - step : rest + step, REST_MIN), REST_MAX);
    if (to === rest) continue;
    proposals.push({
      rubric: subject.rubric,
      from: rest,
      to,
      reason: xs >= BETTER ? 'better' : 'worse',
      xs,
      n: logs.length
    });
  }
  return proposals.sort((a, b) => Math.abs(Math.log(b.xs)) - Math.abs(Math.log(a.xs))).slice(0, PER_RUN);
}
