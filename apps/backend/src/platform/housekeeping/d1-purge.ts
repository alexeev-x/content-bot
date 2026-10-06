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
