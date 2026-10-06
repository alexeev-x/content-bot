import type { JobState } from './status-projection';

// Owner actions (cancel, reschedule) are allowed only while nothing is in flight: `claimed`
// belongs to a dispatcher, `unknown` needs manual reconciliation, the rest are final.
// The SQL guards in the D1 repository must name exactly these states.
export const OWNER_CHANGEABLE_JOB_STATES = ['pending', 'retry_wait'] as const satisfies readonly JobState[];

export function isBeforeSend(state: JobState): boolean {
  return (OWNER_CHANGEABLE_JOB_STATES as readonly JobState[]).includes(state);
}
