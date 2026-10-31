import type { RubricLockFix } from '@alexeev/contracts';
import type { SchedulerSettings } from '../../modules/rubric-scheduler';
import type { Container } from '../container';
import { type SchedulerEnv, schedulerMode, type SchedulerMode } from './runtime';

// What stops the scheduler right now (area-backend-core §14). Locks are state, never errors: «Рубрики» shows them and
// the tick does nothing while any holds. Only the off-switch cleanup still runs.

export type LockCode =
  | 'NOT_HERE'
  | 'SCHEMA'
  | 'SWITCHED_OFF'
  | 'LAB_MASTER_OFF'
  | 'LAB_OFF'
  | 'NO_DESTINATION'
  | 'DESTINATION_DISABLED'
  | 'PUBLISHING_OFF';

/** DEV's «Фоновые задачи»: the master switch and the «Рубрики» job, apart so the owner sees which one is off. */
export type LabSwitches = () => Promise<{ master: boolean; job: boolean }>;

export interface SchedulerState {
  mode: SchedulerMode;
  settings: SchedulerSettings | null;
  locks: LockCode[];
  destination: { id: string; chatId: string; title: string } | null;
}

const missingTable = (error: unknown) => error instanceof Error && /no such table/i.test(error.message);

export async function schedulerState(
  container: Pick<Container, 'rubricSchedulerSettings' | 'destinations' | 'publishing'>,
  env: SchedulerEnv,
  lab: LabSwitches
): Promise<SchedulerState> {
  const mode = schedulerMode(env);
  if (mode === 'unavailable') return { mode, settings: null, locks: ['NOT_HERE'], destination: null };
  let settings: SchedulerSettings;
  try {
    settings = await container.rubricSchedulerSettings.read();
  } catch (error) {
    if (missingTable(error)) return { mode, settings: null, locks: ['SCHEMA'], destination: null };
    throw error;
  }
  const locks: LockCode[] = [];
  if (!settings.enabled) locks.push('SWITCHED_OFF');
  if (!container.publishing.enabled) locks.push('PUBLISHING_OFF');
  if (mode === 'rehearsal') {
    const switches = await lab();
    if (!switches.master) locks.push('LAB_MASTER_OFF');
    if (!switches.job) locks.push('LAB_OFF');
  }

  // Both modes post where the owner chose in «Рубрики» (owner, 31.10.2026: DEV picks its channel like autoposting).
  const destinationId = settings.destinationId;
  let destination: SchedulerState['destination'] = null;
  if (destinationId === null) locks.push('NO_DESTINATION');
  else {
    const record = await container.destinations.findById(destinationId);
    if (record === null || !record.enabled) locks.push('DESTINATION_DISABLED');
    else destination = { id: record.id, chatId: record.chatId, title: record.title };
  }
  return { mode, settings, locks, destination };
}

const FIXES: Record<LockCode, RubricLockFix | null> = {
  NOT_HERE: null,
  SCHEMA: null,
  SWITCHED_OFF: 'ENABLE_RUBRICS',
  LAB_MASTER_OFF: 'ENABLE_LAB_MASTER',
  LAB_OFF: 'ENABLE_LAB_JOB',
  NO_DESTINATION: 'PICK_CHANNEL',
  DESTINATION_DISABLED: 'PICK_CHANNEL',
  PUBLISHING_OFF: null
};

export const lockDto = (code: LockCode) => ({ code, fix: FIXES[code] });
