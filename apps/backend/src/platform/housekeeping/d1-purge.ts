// Bounded cleanup of the platform's own short-lived tables (idempotency keys, rate-limit windows).
// Requests purge a few rows now and then; this is the guaranteed sweep, run from the hourly Cron tick.

// Rate-limit windows are never longer than this (see d1-rate-limiter), so older rows are expired for everyone.
const RATE_LIMIT_HORIZON_MS = 60 * 60 * 1000;

export async function purgeExpiredPlatformRows(
  db: D1Database,
  input: { now: number; limit: number }
): Promise<{ idempotencyKeys: number; rateLimits: number }> {
  const [keys, windows] = await db.batch([
    db
      .prepare(
        `DELETE FROM idempotency_keys WHERE rowid IN
           (SELECT rowid FROM idempotency_keys WHERE expires_at <= ?1 ORDER BY expires_at LIMIT ?2)`
      )
      .bind(input.now, input.limit),
    db
      .prepare(
        `DELETE FROM rate_limits WHERE bucket IN
           (SELECT bucket FROM rate_limits WHERE window_start < ?1 ORDER BY window_start LIMIT ?2)`
      )
      .bind(input.now - RATE_LIMIT_HORIZON_MS, input.limit)
  ]);
  return { idempotencyKeys: keys?.meta.changes ?? 0, rateLimits: windows?.meta.changes ?? 0 };
}

const JOB_ATTEMPT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const HISTORY_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

// Each bounded DELETE is replay-safe. Delivery state and publication rows are never changed here.
export async function purgeOperationalRows(
  db: D1Database,
  input: { now: number; limit: number }
): Promise<{ jobAttempts: number; resolvedIncidents: number; auditRows: number }> {
  const attemptCutoff = input.now - JOB_ATTEMPT_RETENTION_MS;
  const historyCutoff = input.now - HISTORY_RETENTION_MS;
  const [attempts, incidents, auditRows] = await db.batch([
    db
      .prepare(
        `DELETE FROM job_attempts WHERE rowid IN (
           SELECT a.rowid
           FROM job_attempts AS a INDEXED BY job_attempts_finished_idx
           JOIN jobs AS j ON j.id = a.job_id
           WHERE a.finished_at < ?1
             AND j.status IN ('succeeded', 'failed', 'cancelled')
             AND NOT EXISTS (
               SELECT 1 FROM incidents AS i INDEXED BY incidents_job_idx
               WHERE i.job_id = j.id AND i.resolved_at IS NULL
             )
           ORDER BY a.finished_at, a.job_id, a.attempt
           LIMIT ?2
         )`
      )
      .bind(attemptCutoff, input.limit),
    db
      .prepare(
        `DELETE FROM incidents WHERE id IN (
           SELECT id FROM incidents INDEXED BY incidents_resolved_idx
           WHERE resolved_at < ?1
           ORDER BY resolved_at, id
           LIMIT ?2
         )`
      )
      .bind(historyCutoff, input.limit),
    db
      .prepare(
        `DELETE FROM audit_log WHERE rowid IN (
           SELECT rowid FROM audit_log INDEXED BY audit_log_created_idx
           WHERE created_at < ?1
           ORDER BY created_at, id
           LIMIT ?2
         )`
      )
      .bind(historyCutoff, input.limit)
  ]);
  return {
    jobAttempts: attempts?.meta.changes ?? 0,
    resolvedIncidents: incidents?.meta.changes ?? 0,
    auditRows: auditRows?.meta.changes ?? 0
  };
}
