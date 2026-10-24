// Telegram redelivers an update when the webhook answered too slowly or failed, so one update_id can
// arrive more than once. The primary key of webhook_updates (migration 0009) makes the first insert win.
export interface UpdateDedup {
  /** True for the first sight of this update id, false for a replay. */
  claim(updateId: number, now: number): Promise<boolean>;
}

// Telegram keeps an undelivered update for 24 hours; three days is far past any redelivery.
export const UPDATE_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
// Old rows are deleted a few at a time, in the same round trip as the insert, so the table stays small
// without a Cron step of its own (an owner-only bot adds a handful of rows a day).
const PURGE_PER_CLAIM = 5;

export function createD1UpdateDedup(db: D1Database): UpdateDedup {
  return {
    async claim(updateId, now) {
      const [inserted] = await db.batch([
        db
          .prepare(
            'INSERT INTO webhook_updates (update_id, received_at) VALUES (?1, ?2) ON CONFLICT (update_id) DO NOTHING'
          )
          .bind(updateId, now),
        db
          .prepare(
            `DELETE FROM webhook_updates WHERE update_id IN
               (SELECT update_id FROM webhook_updates WHERE received_at < ?1 ORDER BY received_at LIMIT ?2)`
          )
          .bind(now - UPDATE_RETENTION_MS, PURGE_PER_CLAIM)
      ]);
      return inserted?.meta.changes === 1;
    }
  };
}
