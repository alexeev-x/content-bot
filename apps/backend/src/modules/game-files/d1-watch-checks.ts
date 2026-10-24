// The last check of the game-files and Steam watches (migration 0109), for «Состояние лент». One upsert per run.

export type WatchKey = 'game_files' | 'steam_apps';

export interface WatchCheckRow {
  key: WatchKey;
  lastAttemptAt: number;
  lastSuccessAt: number | null;
  errorCode: string | null;
  consecutiveFailures: number;
}

export interface WatchCheckRepository {
  /** A run's result: `errorCode` null is a successful read. */
  record(key: WatchKey, now: number, errorCode: string | null): Promise<void>;
  list(): Promise<WatchCheckRow[]>;
}

export function createD1WatchChecks(db: D1Database): WatchCheckRepository {
  return {
    async record(key, now, errorCode) {
      await db
        .prepare(
          `INSERT INTO source_watch_checks (watch_key, last_attempt_at, last_success_at, error_code, consecutive_failures)
           VALUES (?1, ?2, CASE WHEN ?3 IS NULL THEN ?2 END, ?3, CASE WHEN ?3 IS NULL THEN 0 ELSE 1 END)
           ON CONFLICT (watch_key) DO UPDATE SET
             last_attempt_at = excluded.last_attempt_at,
             last_success_at = COALESCE(excluded.last_success_at, last_success_at),
             error_code = excluded.error_code,
             consecutive_failures = CASE WHEN excluded.error_code IS NULL THEN 0 ELSE consecutive_failures + 1 END`
        )
        .bind(key, now, errorCode === null ? null : errorCode.slice(0, 60))
        .run();
    },
    async list() {
      const rows = await db
        .prepare(
          'SELECT watch_key, last_attempt_at, last_success_at, error_code, consecutive_failures FROM source_watch_checks'
        )
        .all<{
          watch_key: string;
          last_attempt_at: number;
          last_success_at: number | null;
          error_code: string | null;
          consecutive_failures: number;
        }>();
      return rows.results.flatMap((row) =>
        row.watch_key === 'game_files' || row.watch_key === 'steam_apps'
          ? [
              {
                key: row.watch_key,
                lastAttemptAt: row.last_attempt_at,
                lastSuccessAt: row.last_success_at,
                errorCode: row.error_code,
                consecutiveFailures: row.consecutive_failures
              }
            ]
          : []
      );
    }
  };
}
