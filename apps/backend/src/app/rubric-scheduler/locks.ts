import type { SchedulerSettings } from '../../modules/rubric-scheduler';
import type { Container } from '../container';
import { rehearsalTarget, type SchedulerEnv, schedulerMode, type SchedulerMode } from './runtime';

// What stops the scheduler right now (area-backend-core §14). Locks are state, never errors: «Рубрики» shows them and
// the tick does nothing while any holds. Only the off-switch cleanup still runs.

export type LockCode =
  | 'NOT_HERE'
  | 'SCHEMA'
  | 'SWITCHED_OFF'
  | 'LAB_OFF'
  | 'NO_DESTINATION'
  | 'DESTINATION_DISABLED'
  | 'REHEARSAL_DESTINATION'
  | 'PUBLISHING_OFF';

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
  labOn: () => Promise<boolean>
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
  if (mode === 'rehearsal' && !(await labOn())) locks.push('LAB_OFF');

  // The rehearsal posts only to the test channel, whatever the switch names; live posts where the owner chose.
  const rehearsal = mode === 'rehearsal' ? rehearsalTarget(env) : null;
  const destinationId = mode === 'rehearsal' ? (rehearsal?.destinationId ?? null) : settings.destinationId;
  let destination: SchedulerState['destination'] = null;
  if (destinationId === null) locks.push(mode === 'rehearsal' ? 'REHEARSAL_DESTINATION' : 'NO_DESTINATION');
  else {
    const record = await container.destinations.findById(destinationId);
    if (record === null || !record.enabled) locks.push('DESTINATION_DISABLED');
    else if (rehearsal !== null && record.chatId !== rehearsal.chatId) locks.push('REHEARSAL_DESTINATION');
    else destination = { id: record.id, chatId: record.chatId, title: record.title };
  }
  return { mode, settings, locks, destination };
}
