import type { Need, Pace } from '../../modules/rubric-scheduler';
import { type CapabilityEnv, rubricCapabilities } from '../rubric-catalog';

/** The Worker settings the scheduler reads (the Worker's env, or the container's copy of it). */
export interface SchedulerEnv extends CapabilityEnv {
  RUBRIC_SCHEDULER?: string;
  /** DEV only: «week» runs the rehearsal at the week-long test's pace (rehearsal.ts); anything else, the usual pace. */
  RUBRIC_REHEARSAL_PACE?: string;
  /** Browser Rendering minutes a day for the rubrics, in ms (stage P). */
  BROWSER_DAILY_CAP_MS?: string;
}

// Where the rubric scheduler runs and how (MASTER-PLAN §2.2, area-backend-core §14): production posts to the channel
// the owner picks («on»); DEV rehearses into the channel the owner picks there, without AI («rehearsal»); anything
// else only forecasts.

export type SchedulerMode = 'live' | 'rehearsal' | 'unavailable';

/** The Worker var RUBRIC_SCHEDULER: «on» (or «true») on production, «rehearsal» on DEV; any other value is off. */
export function schedulerMode(env: SchedulerEnv): SchedulerMode {
  const value = (env.RUBRIC_SCHEDULER ?? '').trim().toLowerCase();
  if (value === 'on' || value === 'true') return 'live';
  if (value === 'rehearsal') return 'rehearsal';
  return 'unavailable';
}

/**
 * The week-long DEV test (owner, 31.10.2026: «уменьши на дев… тест будет неделя»): rests ÷ 8, six rubric slots a day
 * an hour apart, so all 31 rubrics go out within a week. Only in the rehearsal and only with RUBRIC_REHEARSAL_PACE=week.
 */
export const WEEK_PACE: Pace = {
  restDivisor: 8,
  extraMinutes: [10 * 60, 14 * 60 + 30, 16 * 60 + 30, 21 * 60],
  dayPosts: 8,
  dayRubrics: 6,
  gapMs: 60 * 60_000,
  interactiveDay: 2,
  interactiveGapMs: 4 * 60 * 60_000,
  interactiveWeek: 14
};

export function rehearsalPace(env: SchedulerEnv, mode: SchedulerMode): Pace | null {
  return mode === 'rehearsal' && (env.RUBRIC_REHEARSAL_PACE ?? '').trim().toLowerCase() === 'week' ? WEEK_PACE : null;
}

/** What the week-long test stands in for: a rubric needing these goes out with a stub text, never a paid call. */
export const STUBBED_NEEDS: readonly Need[] = ['ai_text', 'ai_image', 'ai_upscale', 'stratz', 'stats_db'];

/** What the plan may count on: in the week-long test the stubbed needs too, so every rubric is planned. */
export function planCapabilities(env: SchedulerEnv, mode: SchedulerMode): Set<Need> {
  const capabilities = schedulerCapabilities(env, mode);
  if (rehearsalPace(env, mode) !== null) for (const need of STUBBED_NEEDS) capabilities.add(need);
  return capabilities;
}

/** What the scheduler may use: the rehearsal never calls the AI, STRATZ or the match base (owner, 30.10.2026). */
export function schedulerCapabilities(env: SchedulerEnv, mode: SchedulerMode): Set<Need> {
  if (mode !== 'rehearsal') return rubricCapabilities(env);
  const capabilities = new Set<Need>();
  if (env.BROWSER !== undefined) capabilities.add('browser');
  return capabilities;
}
