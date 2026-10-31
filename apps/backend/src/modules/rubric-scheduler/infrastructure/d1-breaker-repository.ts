import type { BreakerRepository } from '../application/ports';

// Breakers (migration 0119): a rubric that keeps failing rests instead of failing every slot. The last six failure
// times are kept; three inside the window open the breaker for its rest period.

const KEPT = 6;

export function createD1BreakerRepository(db: D1Database): BreakerRepository {
  return {
    async recordFailure({ scope, key, now, code, windowMs, threshold, openMs }) {
      const row = await db
        .prepare('SELECT failures_json, opened_until FROM rubric_breakers WHERE scope = ?1 AND key = ?2')
        .bind(scope, key)
        .first<{ failures_json: string; opened_until: number | null }>();
      const failures = [...(row === null ? [] : (JSON.parse(row.failures_json) as number[])), now]
        .filter((at) => at > now - windowMs)
        .slice(-KEPT);
      const alreadyOpen = row?.opened_until !== null && row?.opened_until !== undefined && row.opened_until > now;
      const opens = !alreadyOpen && failures.length >= threshold;
      const openedUntil = opens ? now + openMs : alreadyOpen ? (row?.opened_until ?? null) : null;
      await db
        .prepare(
          `INSERT INTO rubric_breakers (scope, key, failures_json, opened_until, last_code, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT (scope, key) DO UPDATE SET failures_json = excluded.failures_json,
             opened_until = excluded.opened_until, last_code = excluded.last_code, updated_at = excluded.updated_at`
        )
        .bind(scope, key, JSON.stringify(opens ? [] : failures), openedUntil, code.slice(0, 80), now)
        .run();
      return { opened: opens, openedUntil };
    },

    async open(scope, now) {
      const { results } = await db
        .prepare('SELECT key, opened_until, last_code FROM rubric_breakers WHERE scope = ?1 AND opened_until > ?2')
        .bind(scope, now)
        .all<{ key: string; opened_until: number; last_code: string | null }>();
      return results.map((row) => ({ key: row.key, until: row.opened_until, code: row.last_code }));
    }
  };
}
