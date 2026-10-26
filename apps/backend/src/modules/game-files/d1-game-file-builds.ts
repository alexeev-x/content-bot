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
  /** Keeps the check's reason of a queued find. */
  noteCheck(sha: string, note: string): Promise<void>;
  /** Links a queued find to the post made of it. */
  attachPost(sha: string, postId: string): Promise<void>;
  /** The finds committed since `since`, newest first: one bounded read. */
  recentFinds(since: number): Promise<GameFind[]>;
}

/** A find of the game's files with what the check and the writer made of it. */
export interface GameFind {
  sha: string;
  build: string;
  committedAt: number;
  /** The cheap check's reason; null for a find from before it was kept. */
  note: string | null;
  /** The post the writer made of it (as it stands now); null when none was made. */
  text: string | null;
}

const SHAS_MAX = 100;
const FINDS_MAX = 8;
const FIND_TEXT_MAX = 1500;

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
    },
    async noteCheck(sha, note) {
      await db
        .prepare(`UPDATE game_file_builds SET check_note = ?2 WHERE sha = ?1 AND status = 'queued'`)
        .bind(sha, note.slice(0, 200))
        .run();
    },
    async attachPost(sha, postId) {
      await db
        .prepare(`UPDATE game_file_builds SET post_id = ?2 WHERE sha = ?1 AND status = 'queued'`)
        .bind(sha, postId)
        .run();
    },
    async recentFinds(since) {
      const { results } = await db
        .prepare(
          // The post's body is read here, not through the posts module: one query instead of one per find.
          `SELECT b.sha, b.build, b.committed_at, b.check_note, substr(p.body, 1, ?2) AS text
           FROM game_file_builds b LEFT JOIN posts p ON p.id = b.post_id
           WHERE b.status = 'queued' AND b.committed_at >= ?1
           ORDER BY b.committed_at DESC LIMIT ?3`
        )
        .bind(since, FIND_TEXT_MAX, FINDS_MAX)
        .all<{ sha: string; build: string; committed_at: number; check_note: string | null; text: string | null }>();
      return results.map((row) => ({
        sha: row.sha,
        build: row.build,
        committedAt: row.committed_at,
        note: row.check_note,
        text: row.text
      }));
    }
  };
}
