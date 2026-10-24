// The builds of the game's files already seen (migration 0107): each is read once. `claim` is the one guard of a
// build's post: two overlapping runs may both find a new build, only the run whose insert lands sends its job.

export type GameFileBuildStatus = 'skipped' | 'queued' | 'failed';

export interface GameFileBuildRow {
  sha: string;
  build: string;
  committedAt: number;
  status: GameFileBuildStatus;
  reason: string | null;
}

export interface GameFileBuildRepository {
  /** True before the first run: the builds found then are the baseline and never become posts. */
  isEmpty(): Promise<boolean>;
  /** Which of `shas` were seen before. */
  known(shas: readonly string[]): Promise<Set<string>>;
  /** Records builds that need no post; one already recorded stays as it was. */
  skip(rows: readonly Omit<GameFileBuildRow, 'status'>[], now: number): Promise<void>;
  /** Claims a build's post; false when another run did first. */
  claim(row: Omit<GameFileBuildRow, 'status' | 'reason'>, now: number): Promise<boolean>;
  /** A claimed build whose post did not happen, and why. */
  release(sha: string, status: Exclude<GameFileBuildStatus, 'queued'>, reason: string): Promise<void>;
  /** The highest build number seen below `build`, or null. */
  previousBuild(build: string): Promise<string | null>;
  /** Whether a commit of `build` had a find sent to the writer. */
  hadFind(build: string): Promise<boolean>;
}

const SHAS_MAX = 100;

export function createD1GameFileBuilds(db: D1Database): GameFileBuildRepository {
  return {
    async isEmpty() {
      const row = await db.prepare('SELECT 1 AS any FROM game_file_builds LIMIT 1').first<{ any: number }>();
      return row === null;
    },
    async known(shas) {
      const list = shas.slice(0, SHAS_MAX);
      if (list.length === 0) return new Set();
      const { results } = await db
        .prepare('SELECT sha FROM game_file_builds WHERE sha IN (SELECT value FROM json_each(?1))')
        .bind(JSON.stringify(list))
        .all<{ sha: string }>();
      return new Set(results.map((row) => row.sha));
    },
    async skip(rows, now) {
      if (rows.length === 0) return;
      await db.batch(
        rows.slice(0, SHAS_MAX).map((row) =>
          db
            .prepare(
              `INSERT OR IGNORE INTO game_file_builds (sha, build, committed_at, detected_at, status, reason)
               VALUES (?1, ?2, ?3, ?4, 'skipped', ?5)`
            )
            .bind(row.sha, row.build, row.committedAt, now, row.reason)
        )
      );
    },
    async claim(row, now) {
      const result = await db
        .prepare(
          `INSERT OR IGNORE INTO game_file_builds (sha, build, committed_at, detected_at, status, reason)
           VALUES (?1, ?2, ?3, ?4, 'queued', NULL)`
        )
        .bind(row.sha, row.build, row.committedAt, now)
        .run();
      return result.meta.changes === 1;
    },
    async release(sha, status, reason) {
      await db
        .prepare(`UPDATE game_file_builds SET status = ?2, reason = ?3 WHERE sha = ?1 AND status = 'queued'`)
        .bind(sha, status, reason)
        .run();
    },
    async previousBuild(build) {
      const row = await db
        .prepare(
          `SELECT build FROM game_file_builds WHERE CAST(build AS INTEGER) BETWEEN 1 AND CAST(?1 AS INTEGER) - 1
           ORDER BY CAST(build AS INTEGER) DESC LIMIT 1`
        )
        .bind(build)
        .first<{ build: string }>();
      return row?.build ?? null;
    },
    async hadFind(build) {
      const row = await db
        .prepare(`SELECT 1 AS found FROM game_file_builds WHERE build = ?1 AND status = 'queued' LIMIT 1`)
        .bind(build)
        .first<{ found: number }>();
      return row !== null;
    }
  };
}
