// What Steam last said about Dota's apps (migration 0108). `advance` is the one claim of a change: it moves the row
// only from the change number the run read, so two overlapping runs never post the same change twice.

export interface SteamAppRow {
  appId: number;
  changeNumber: number;
  buildId: string | null;
  timeUpdated: number | null;
  /** When the app's last post went out; null before any. */
  postedAt?: number | null;
}

export interface SteamAppRepository {
  find(appId: number): Promise<SteamAppRow | null>;
  /** The first sighting: the baseline, nothing to tell. False when another run recorded it first. */
  start(row: SteamAppRow, now: number): Promise<boolean>;
  /** Moves the row from `from` to `to`; false when another run moved it first. */
  advance(from: SteamAppRow, to: SteamAppRow, now: number): Promise<boolean>;
  /**
   * Claims the app's next post: true when none went out within `gapMs` of `now` (its time is then `now`), false when
   * one did or another run claimed it first (QA 24.10.2026: two overlapping runs both posted Staging).
   */
  claimPost(appId: number, now: number, gapMs: number): Promise<boolean>;
}

export function createD1SteamApps(db: D1Database): SteamAppRepository {
  return {
    async find(appId) {
      const row = await db
        .prepare(
          'SELECT app_id, change_number, build_id, time_updated, posted_at FROM steam_app_watch WHERE app_id = ?1'
        )
        .bind(appId)
        .first<{
          app_id: number;
          change_number: number;
          build_id: string | null;
          time_updated: number | null;
          posted_at: number | null;
        }>();
      return row === null
        ? null
        : {
            appId: row.app_id,
            changeNumber: row.change_number,
            buildId: row.build_id,
            timeUpdated: row.time_updated,
            postedAt: row.posted_at
          };
    },
    async start(row, now) {
      const result = await db
        .prepare(
          `INSERT OR IGNORE INTO steam_app_watch (app_id, change_number, build_id, time_updated, checked_at)
           VALUES (?1, ?2, ?3, ?4, ?5)`
        )
        .bind(row.appId, row.changeNumber, row.buildId, row.timeUpdated, now)
        .run();
      return result.meta.changes === 1;
    },
    async advance(from, to, now) {
      const result = await db
        .prepare(
          // A read without the build (its info came another way) keeps the known one (QA 24.10.2026: a null build
          // stored, then the same build read back, posted a false «new build»).
          `UPDATE steam_app_watch SET change_number = ?3, build_id = COALESCE(?4, build_id),
             time_updated = COALESCE(?5, time_updated), checked_at = ?6
           WHERE app_id = ?1 AND change_number = ?2 AND ?3 > change_number`
        )
        .bind(from.appId, from.changeNumber, to.changeNumber, to.buildId, to.timeUpdated, now)
        .run();
      return result.meta.changes === 1;
    },
    async claimPost(appId, now, gapMs) {
      const result = await db
        .prepare(
          `UPDATE steam_app_watch SET posted_at = ?2
           WHERE app_id = ?1 AND (posted_at IS NULL OR posted_at <= ?2 - ?3)`
        )
        .bind(appId, now, gapMs)
        .run();
      return result.meta.changes === 1;
    }
  };
}
