import type { PublicationStatus } from '@alexeev/contracts';

export type JobState = 'pending' | 'claimed' | 'succeeded' | 'retry_wait' | 'failed' | 'unknown' | 'cancelled';

export interface JobSnapshot {
  status: JobState;
  /** UTC epoch milliseconds. */
  runAt: number;
  /** Set once the confirmed "about to call Telegram" mark is written. */
  sendStartedAt: number | null;
}

// User-facing projection of the internal job state (docs/BACKEND_ARCHITECTURE.md §5).
export function projectPublicationStatus(job: JobSnapshot, now: number): PublicationStatus {
  switch (job.status) {
    case 'pending':
      return job.runAt > now ? 'scheduled' : 'queued';
    case 'claimed':
      return job.sendStartedAt === null ? 'preparing' : 'sending';
    case 'succeeded':
      return 'sent';
    case 'retry_wait':
      return 'retry_wait';
    case 'failed':
      return 'failed';
    case 'unknown':
      return 'unknown';
    case 'cancelled':
      return 'cancelled';
    default: {
      const unreachable: never = job.status;
      throw new Error(`Unhandled job state: ${String(unreachable)}`);
    }
  }
}
