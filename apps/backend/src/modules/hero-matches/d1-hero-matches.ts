import { z } from 'zod';

// The hero-matches base (migration 0116, owner 28.10.2026): high-rank public matches, one row per player, 14 days.
// OpenDota lists them, STRATZ fills their positions hours later; «Гайд на героя» counts from the rows of one hero at
// one position. Every claim is conditional, so overlapping runs never list or read the same matches twice.

/** A player's own part of a match, kept as compact JSON: patch, final items, neutral, purchases, skill order. */
export interface HeroMatchDetail {
  /** STRATZ's game version (patch) id. */
  v: number | null;
  /** The six inventory slots at the end. */
  i: number[];
  /** The neutral slot at the end. */
  n: number | null;
  /** Purchases as [item id, minute]; consumables only before the horn (the starting set). */
  p: [number, number][];
  /** Ability ids in the order the points were spent. */
  s: number[];
}

export interface HeroMatchPlayerRow {
  heroId: number;
  position: number;
  /** UTC milliseconds. */
  startedAt: number;
  matchId: number;
  won: boolean;
  minutes: number;
  /** «heroId:position» of the teammates and the opponents. */
  allies: string;
  enemies: string;
  detail: HeroMatchDetail;
}

/** One game of the hero at the position, without the detail: the rates and matchups count these. */
export interface HeroMatchGame {
  won: boolean;
  minutes: number;
  /** The opponents' hero ids. */
  enemies: number[];
}

export interface HeroMatchSampleRow {
  won: boolean;
  minutes: number;
  startedAt: number;
  detail: HeroMatchDetail;
}

export interface HeroMatchRepository {
  /** Takes the listing turn when the last one is at least `everyMs` old; false when another run has it. */
  claimListing(now: number, everyMs: number): Promise<boolean>;
  /** The newest match id already listed. */
  lastListed(): Promise<number>;
  /** Queues listed matches, each read from `startedAt + delayMs`, and moves the listing past the newest. */
  enqueue(matches: { matchId: number; startedAt: number }[], delayMs: number): Promise<number>;
  /**
   * Claims up to `limit` matches due for a read: drops those out of tries, then moves each claimed one `retryMs` ahead
   * with one more try, so a run that fails leaves it for later and an overlapping run skips it.
   */
  claimDue(now: number, limit: number, retryMs: number): Promise<number[]>;
  /** Keeps the read matches' players and takes those matches off the queue. */
  store(rows: HeroMatchPlayerRow[], done: number[]): Promise<void>;
  /** Once a day: deletes players and queued matches started before `before`. Returns whether it ran. */
  purge(now: number, before: number): Promise<boolean>;
  /** Every game of the hero at the position since `since` (at most 20 000). */
  games(heroId: number, position: number, since: number): Promise<HeroMatchGame[]>;
  /** The newest `limit` games of the hero at the position since `since`, with their detail. */
  sample(heroId: number, position: number, since: number, limit: number): Promise<HeroMatchSampleRow[]>;
}

/** Tries per match: STRATZ may still lack positions on the first read. */
export const HERO_MATCH_TRIES = 3;
const DAY_MS = 86_400_000;
const GAMES_MAX = 20_000;
/** Queue rows per INSERT: three parameters each, under D1's hundred. */
const QUEUE_CHUNK = 30;
const PLAYER_COLUMNS = 9;

const detailSchema = z.object({
  v: z.number().int().nullable().catch(null),
  i: z.array(z.number().int()).max(6).catch([]),
  n: z.number().int().nullable().catch(null),
  p: z
    .array(z.tuple([z.number().int(), z.number().int()]))
    .max(300)
    .catch([]),
  s: z.array(z.number().int()).max(60).catch([])
});

function parseDetail(text: string): HeroMatchDetail | null {
  try {
    const parsed = detailSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const heroIds = (text: string) =>
  text
    .split(',')
    .map((each) => Number(each.split(':')[0]))
    .filter((each) => Number.isInteger(each) && each > 0);

export function createD1HeroMatches(db: D1Database): HeroMatchRepository {
  return {
    async claimListing(now, everyMs) {
      const result = await db
        .prepare('UPDATE hero_match_state SET listed_at = ?1 WHERE id = 1 AND listed_at <= ?2')
        .bind(now, now - everyMs)
        .run();
      return result.meta.changes === 1;
    },
    async lastListed() {
      const row = await db
        .prepare('SELECT last_match_id FROM hero_match_state WHERE id = 1')
        .first<{ last_match_id: number }>();
      return row?.last_match_id ?? 0;
    },
    async enqueue(matches, delayMs) {
      if (matches.length === 0) return 0;
      const statements: D1PreparedStatement[] = [];
      for (let from = 0; from < matches.length; from += QUEUE_CHUNK) {
        const chunk = matches.slice(from, from + QUEUE_CHUNK);
        statements.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO hero_match_queue (match_id, started_at, next_at) VALUES ${chunk
                .map((_, index) => `(?${index * 3 + 1}, ?${index * 3 + 2}, ?${index * 3 + 3})`)
                .join(', ')}`
            )
            .bind(...chunk.flatMap((each) => [each.matchId, each.startedAt, each.startedAt + delayMs]))
        );
      }
      const newest = Math.max(...matches.map((each) => each.matchId));
      statements.push(
        db.prepare('UPDATE hero_match_state SET last_match_id = MAX(last_match_id, ?1) WHERE id = 1').bind(newest)
      );
      const results = await db.batch(statements);
      return results.slice(0, -1).reduce((sum, result) => sum + result.meta.changes, 0);
    },
    async claimDue(now, limit, retryMs) {
      await db
        .prepare('DELETE FROM hero_match_queue WHERE attempts >= ?1 AND next_at <= ?2')
        .bind(HERO_MATCH_TRIES, now)
        .run();
      const rows = await db
        .prepare(
          `UPDATE hero_match_queue SET next_at = ?2, attempts = attempts + 1
           WHERE match_id IN (SELECT match_id FROM hero_match_queue WHERE next_at <= ?1 ORDER BY next_at LIMIT ?3)
             AND next_at <= ?1
           RETURNING match_id`
        )
        .bind(now, now + retryMs, limit)
        .all<{ match_id: number }>();
      return rows.results.map((row) => row.match_id);
    },
    async store(rows, done) {
      const statements: D1PreparedStatement[] = [];
      const byMatch = new Map<number, HeroMatchPlayerRow[]>();
      for (const row of rows) byMatch.set(row.matchId, [...(byMatch.get(row.matchId) ?? []), row]);
      // One INSERT per match: ten players at nine parameters stay under D1's hundred.
      for (const players of byMatch.values())
        statements.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO hero_match_players
                 (hero_id, position, started_at, match_id, won, minutes, allies, enemies, detail)
               VALUES ${players
                 .map(
                   (_, index) =>
                     `(${Array.from({ length: PLAYER_COLUMNS }, (__, column) => `?${index * PLAYER_COLUMNS + column + 1}`).join(', ')})`
                 )
                 .join(', ')}`
            )
            .bind(
              ...players.flatMap((each) => [
                each.heroId,
                each.position,
                each.startedAt,
                each.matchId,
                each.won ? 1 : 0,
                each.minutes,
                each.allies,
                each.enemies,
                JSON.stringify(each.detail)
              ])
            )
        );
      if (done.length > 0)
        statements.push(
          db
            .prepare(
              `DELETE FROM hero_match_queue WHERE match_id IN (${done.map((_, index) => `?${index + 1}`).join(', ')})`
            )
            .bind(...done)
        );
      if (statements.length > 0) await db.batch(statements);
    },
    async purge(now, before) {
      const claimed = await db
        .prepare('UPDATE hero_match_state SET purged_at = ?1 WHERE id = 1 AND purged_at <= ?2')
        .bind(now, now - DAY_MS)
        .run();
      if (claimed.meta.changes !== 1) return false;
      await db.batch([
        db.prepare('DELETE FROM hero_match_players WHERE started_at < ?1').bind(before),
        db.prepare('DELETE FROM hero_match_queue WHERE started_at < ?1').bind(before)
      ]);
      return true;
    },
    async games(heroId, position, since) {
      const rows = await db
        .prepare(
          `SELECT won, minutes, enemies FROM hero_match_players
           WHERE hero_id = ?1 AND position = ?2 AND started_at >= ?3 LIMIT ?4`
        )
        .bind(heroId, position, since, GAMES_MAX)
        .all<{ won: number; minutes: number; enemies: string }>();
      return rows.results.map((row) => ({ won: row.won === 1, minutes: row.minutes, enemies: heroIds(row.enemies) }));
    },
    async sample(heroId, position, since, limit) {
      const rows = await db
        .prepare(
          `SELECT won, minutes, started_at, detail FROM hero_match_players
           WHERE hero_id = ?1 AND position = ?2 AND started_at >= ?3 ORDER BY started_at DESC LIMIT ?4`
        )
        .bind(heroId, position, since, limit)
        .all<{ won: number; minutes: number; started_at: number; detail: string }>();
      return rows.results.flatMap((row) => {
        const detail = parseDetail(row.detail);
        return detail === null ? [] : [{ won: row.won === 1, minutes: row.minutes, startedAt: row.started_at, detail }];
      });
    }
  };
}
