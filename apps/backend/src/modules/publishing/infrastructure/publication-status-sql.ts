import type { PublicationStatus } from '@alexeev/contracts';

// The SQL form of projectPublicationStatus (domain/status-projection.ts): which job rows project
// to a status. `usesNow` says the condition has one `?` that must be bound to the current time.
// A test checks both functions against every job state, so they cannot drift apart silently.
export function jobConditionForStatus(status: PublicationStatus): { sql: string; usesNow: boolean } {
  switch (status) {
    case 'scheduled':
      return { sql: "j.status = 'pending' AND j.run_at > ?", usesNow: true };
    case 'queued':
      return { sql: "j.status = 'pending' AND j.run_at <= ?", usesNow: true };
    case 'preparing':
      return { sql: "j.status = 'claimed' AND j.send_started_at IS NULL", usesNow: false };
    case 'sending':
      return { sql: "j.status = 'claimed' AND j.send_started_at IS NOT NULL", usesNow: false };
    case 'sent':
      return { sql: "j.status = 'succeeded'", usesNow: false };
    case 'retry_wait':
      return { sql: "j.status = 'retry_wait'", usesNow: false };
    case 'failed':
      return { sql: "j.status = 'failed'", usesNow: false };
    case 'unknown':
      return { sql: "j.status = 'unknown'", usesNow: false };
    case 'cancelled':
      return { sql: "j.status = 'cancelled'", usesNow: false };
    default: {
      const unreachable: never = status;
      throw new Error(`Unhandled publication status: ${String(unreachable)}`);
    }
  }
}
