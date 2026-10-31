import type { Need } from '../../modules/rubric-scheduler';
import { type CapabilityEnv, rubricCapabilities } from '../rubric-catalog';

/** The Worker settings the scheduler reads (the Worker's env, or the container's copy of it). */
export interface SchedulerEnv extends CapabilityEnv {
  RUBRIC_SCHEDULER?: string;
  RUBRIC_REHEARSAL_DESTINATION_ID?: string;
  RUBRIC_REHEARSAL_CHAT_ID?: string;
  /** Browser Rendering minutes a day for the rubrics, in ms (stage P). */
  BROWSER_DAILY_CAP_MS?: string;
}

// Where the rubric scheduler runs and how (MASTER-PLAN §2.2, area-backend-core §14): production posts to the channel
// the owner picks («on»), DEV rehearses into the test channel without AI («rehearsal»), anything else only forecasts.

export type SchedulerMode = 'live' | 'rehearsal' | 'unavailable';

/** The Worker var RUBRIC_SCHEDULER: «on» (or «true») on production, «rehearsal» on DEV; any other value is off. */
export function schedulerMode(env: SchedulerEnv): SchedulerMode {
  const value = (env.RUBRIC_SCHEDULER ?? '').trim().toLowerCase();
  if (value === 'on' || value === 'true') return 'live';
  if (value === 'rehearsal') return 'rehearsal';
  return 'unavailable';
}

/** What the scheduler may use: the rehearsal never calls the AI, STRATZ or the match base (owner, 30.10.2026). */
export function schedulerCapabilities(env: SchedulerEnv, mode: SchedulerMode): Set<Need> {
  if (mode !== 'rehearsal') return rubricCapabilities(env);
  const capabilities = new Set<Need>();
  if (env.BROWSER !== undefined) capabilities.add('browser');
  return capabilities;
}

/** The rehearsal's only channel: its destination id and the chat id it must have (anything else is refused). */
export function rehearsalTarget(env: SchedulerEnv): { destinationId: string; chatId: string } | null {
  const destinationId = (env.RUBRIC_REHEARSAL_DESTINATION_ID ?? '').trim();
  const chatId = (env.RUBRIC_REHEARSAL_CHAT_ID ?? '').trim();
  return destinationId === '' || chatId === '' ? null : { destinationId, chatId };
}
