import type { JobState } from '../../src/modules/publishing/domain/status-projection';

// Every internal job state, for tests that must cover them all: the Record makes the compiler
// fail here when a state is added to JobState and not to this list.
const stateSet: Record<JobState, true> = {
  pending: true,
  claimed: true,
  retry_wait: true,
  succeeded: true,
  failed: true,
  unknown: true,
  cancelled: true
};

export const JOB_STATES_FOR_TESTS = Object.keys(stateSet) as JobState[];
