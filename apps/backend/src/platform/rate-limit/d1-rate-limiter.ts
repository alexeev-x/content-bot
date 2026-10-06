import { sha256Hex } from '../security/sha256';

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSec: number;
}

export interface RateLimiter {
  /** Counts one attempt of `client` against `name` and says whether it is within `limit` per window. */
  hit(input: {
    name: string;
    client: string;
    limit: number;
    windowMs: number;
    now: number;
  }): Promise<RateLimitDecision>;
}

// Rows older than this are expired for every caller (windows are never longer), so they are safe to purge.
const MAX_WINDOW_MS = 60 * 60 * 1000;
const PURGE_BATCH = 20;

interface CounterRow {
  count: number;
  window_start: number;
}

// Fixed window kept in D1: exact (unlike the Workers Rate Limiting binding, which is per location
// and approximate), driven by the injected clock, and one round trip. The window resets inside
// the single upsert, so concurrent requests cannot both start a window.
export function createD1RateLimiter(db: D1Database): RateLimiter {
  return {
    async hit({ name, client, limit, windowMs, now }) {
      if (windowMs > MAX_WINDOW_MS) throw new RangeError('windowMs exceeds the purge horizon');
      const bucket = `${name}:${(await sha256Hex(client)).slice(0, 32)}`;
      const [, upsert] = await db.batch<CounterRow>([
        db
          .prepare(
            `DELETE FROM rate_limits WHERE bucket IN
               (SELECT bucket FROM rate_limits WHERE window_start < ?1 LIMIT ${PURGE_BATCH})`
          )
          .bind(now - MAX_WINDOW_MS),
        db
          .prepare(
            `INSERT INTO rate_limits (bucket, window_start, count) VALUES (?1, ?2, 1)
             ON CONFLICT (bucket) DO UPDATE SET
               count = CASE WHEN window_start <= ?3 THEN 1 ELSE count + 1 END,
               window_start = CASE WHEN window_start <= ?3 THEN ?2 ELSE window_start END
             WHERE window_start <= ?3 OR count <= ?4
             RETURNING count, window_start`
          )
          .bind(bucket, now, now - windowMs, limit)
      ]);
      const counted = upsert?.results[0];
      // Once a bucket is past its limit the guarded upsert changes nothing and returns no row, so
      // a flood from one client stops writing to D1; the window start is read only for Retry-After.
      const row =
        counted ??
        (await db
          .prepare('SELECT count, window_start FROM rate_limits WHERE bucket = ?1')
          .bind(bucket)
          .first<CounterRow>());
      if (row === null) throw new Error('rate limit counter was not returned');
      return {
        allowed: counted !== undefined && counted.count <= limit,
        retryAfterSec: Math.max(1, Math.ceil((row.window_start + windowMs - now) / 1000))
      };
    }
  };
}
