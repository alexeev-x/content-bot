import { z } from 'zod';
import type { PlayerDetail, StatsMatchRow, StatsPlayerRow } from './domain';

// The statistics database (`STATS_DB`, migrations-stats/0001). Every claim is conditional, so overlapping Cron runs
// never scan the same account or read the same match twice; every spend passes a budget counter first.

export type Band = 'all' | 'immortal' | 'top';
export type Span = 'd8' | 'd14' | 'patch';
export const BANDS: readonly Band[] = ['all', 'immortal', 'top'];
/**
 * Leaderboard players in a match for the «top» band (≈ Dota2ProTracker's 7000+). A first guess to calibrate against
 * its counts (plan §5): the share of matches it keeps is in the daily health line.
 */
export const TOP_BAND_MIN = 4;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** D1 takes at most 100 bound parameters per statement. */
const PARAMS_MAX = 100;
const PLAYER_COLUMNS = 23;
const GAMES_MAX = 50_000;
/** A dropped match's marker outlives the 72-hour listing window: start + 4 days. */
const MARKER_MS = 4 * DAY_MS;

export interface AccountScan {
  accountId: number;
  /** Matches the scan found, newest start (UTC ms) when any. */
  found: number;
  newest: number | null;
  failed: boolean;
}

export interface HealthDelta {
  listed?: number;
  read?: number;
  kept?: number;
  dropped?: number;
  failed?: number;
  calls?: number;
  keptAt?: number;
  error?: string;
}

export interface HealthDay {
  day: number;
  listed: number;
  read: number;
  kept: number;
  dropped: number;
  failed: number;
  calls: number;
  lastKeptAt: number | null;
  lastError: string | null;
}

/** One player row as the snapshots and the guide read it. */
export interface StatsRow {
  matchId: number;
  heroId: number;
  position: number;
  startedAt: number;
  patch: number;
  tracked: boolean;
  won: boolean;
  minutes: number;
  bracket: number;
  topPlayers: number;
  lane: -1 | 0 | 1 | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  gpm: number | null;
  xpm: number | null;
  damage: number | null;
  nw10: number | null;
  allies: string;
  enemies: string;
  detail: PlayerDetail;
}

export interface SnapshotRow {
  patch: number;
  heroId: number;
  position: number;
  band: Band;
  span: Span;
  matches: number;
  wins: number;
  data: string;
}

export interface HeroStatsRepository {
  /** Spends `calls` STRATZ requests if the hour's and the day's counters stay under their caps; false otherwise. */
  spendStratz(now: number, calls: number, hourCap: number, dayCap: number): Promise<boolean>;
  /** Counts read matches against the day's cap; false when the cap is reached. */
  spendReads(now: number, matches: number, dayCap: number): Promise<boolean>;
  /** STRATZ requests spent today and in the current hour, and matches read today. */
  stratzSpent(now: number): Promise<{ hour: number; day: number; reads: number }>;
  /** Takes a turn named `key` when the last one is at least `everyMs` old; false when another run has it. */
  claimTurn(key: string, now: number, everyMs: number): Promise<boolean>;
  stateValue(key: string): Promise<number>;
  setState(key: string, value: number): Promise<void>;
  /** Adds or refreshes leaderboard accounts; new ones are due for a scan at once. */
  upsertLeaderboard(rows: { accountId: number; rank: number }[], now: number): Promise<number>;
  /** All followed account ids (the tracked set) and the leaderboard ones (the «top» set). */
  accountSets(): Promise<{ tracked: Set<number>; top: Set<number> }>;
  /** Claims up to `limit` accounts due for a scan, leasing them `leaseMs` ahead so an overlapping run skips them. */
  claimAccounts(now: number, limit: number, leaseMs: number): Promise<number[]>;
  /** Records scans: an account that found matches is due again sooner; a failed one backs off. */
  scanned(scans: AccountScan[], now: number): Promise<void>;
  /** Queues matches not kept or queued yet; returns how many were new. */
  enqueue(matches: { matchId: number; startedAt: number; top: number }[], now: number): Promise<number>;
  /**
   * Claims up to `limit` queued matches due for a read (leaderboard-heavy first), moving each `retryMs` ahead with one
   * more try. Matches out of tries are deleted first; their count comes back as `exhausted`.
   */
  claimReads(now: number, limit: number, retryMs: number): Promise<{ ids: number[]; exhausted: number }>;
  /** Gives claimed matches that were not read back their try and makes them due at once. */
  release(ids: number[], now: number): Promise<void>;
  /**
   * Keeps read matches and their players and takes them off the queue; `dropped` ones stay as markers until their
   * listing window has passed. One batch.
   */
  store(kept: { match: StatsMatchRow; players: StatsPlayerRow[] }[], dropped: number[], now: number): Promise<void>;
  addHealth(now: number, delta: HealthDelta): Promise<void>;
  health(day: number): Promise<HealthDay | null>;
  /** Once a day: deletes rows older than `keepMs` and what no longer matters. Returns whether it ran. */
  purge(now: number, keepMs: number): Promise<boolean>;
  /** The newest patch among kept matches (0 when empty). */
  currentPatch(): Promise<number>;
  /** Every hero ever kept (a small table, so no listing scans the player rows). */
  heroes(): Promise<number[]>;
  /** The newest rows (at most `limit`) of a hero at a position since `since` in `patch`. */
  heroRows(heroId: number, position: number, since: number, patch: number, limit: number): Promise<StatsRow[]>;
  /**
   * Untracked games and wins per hero, position and band since `since` in `patch` (the matchup baselines), one key
   * range per hero.
   */
  baseRates(
    heroIds: readonly number[],
    since: number,
    patch: number
  ): Promise<Map<string, { matches: number; wins: number }>>;
  writeSnapshots(rows: SnapshotRow[], now: number): Promise<void>;
  writeDays(
    rows: { day: number; heroId: number; position: number; band: Band; matches: number; wins: number }[]
  ): Promise<void>;
  snapshot(patch: number, heroId: number, position: number, band: Band, span: Span): Promise<SnapshotRow | null>;
  /** The newest rows of a hero at a position since `since` in a band (the guide's sample and rates). */
  rows(heroId: number, position: number, since: number, band: Band, limit: number): Promise<StatsRow[]>;
}

const detailSchema = z.object({
  i: z.array(z.number().int()).max(6).catch([]),
  n: z.number().int().nullable().catch(null),
  p: z
    .array(z.tuple([z.number().int(), z.number().int()]))
    .max(300)
    .catch([]),
  s: z.array(z.number().int()).max(60).catch([])
});

function parseDetail(text: string): PlayerDetail | null {
  try {
    const parsed = detailSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The SQL condition of a band on `stats_players`. */
export function bandCondition(band: Band): string {
  if (band === 'immortal') return 'bracket >= 8';
  if (band === 'top') return `top_players >= ${TOP_BAND_MIN}`;
  return 'bracket >= 7';
}

/** The hour or day number at the end of a budget key ('stratz:h:<n>', 'stratz:d:<n>', 'read:d:<n>'). */
const BUDGET_NUMBER = "CAST(substr(key, length(rtrim(key, '0123456789')) + 1) AS INTEGER)";
const dayOf = (now: number) => Math.floor(now / DAY_MS);
const hourOf = (now: number) => Math.floor(now / HOUR_MS);

interface RawRow {
  match_id: number;
  hero_id: number;
  position: number;
  started_at: number;
  patch: number;
  tracked: number;
  won: number;
  minutes: number;
  bracket: number;
  top_players: number;
  lane: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  gpm: number | null;
  xpm: number | null;
  damage: number | null;
  nw10: number | null;
  allies: string;
  enemies: string;
  detail: string;
}

const ROW_COLUMNS = `match_id, hero_id, position, started_at, patch, tracked, won, minutes, bracket, top_players, lane,
  kills, deaths, assists, gpm, xpm, damage, nw10, allies, enemies, detail`;

function toRow(row: RawRow): StatsRow | null {
  const detail = parseDetail(row.detail);
  if (detail === null) return null;
  return {
    matchId: row.match_id,
    heroId: row.hero_id,
    position: row.position,
    startedAt: row.started_at,
    patch: row.patch,
    tracked: row.tracked === 1,
    won: row.won === 1,
    minutes: row.minutes,
    bracket: row.bracket,
    topPlayers: row.top_players,
    lane: row.lane === 1 || row.lane === 0 || row.lane === -1 ? row.lane : null,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    gpm: row.gpm,
    xpm: row.xpm,
    damage: row.damage,
    nw10: row.nw10,
    allies: row.allies,
    enemies: row.enemies,
    detail
  };
}

const placeholders = (rows: number, columns: number) =>
  Array.from(
    { length: rows },
    (_, row) => `(${Array.from({ length: columns }, (__, column) => `?${row * columns + column + 1}`).join(', ')})`
  ).join(', ');

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let from = 0; from < items.length; from += size) out.push(items.slice(from, from + size));
  return out;
}

export function createD1HeroStats(db: D1Database): HeroStatsRepository {
  /** Grows a counter by `amount` only while it stays at or under `cap`; true when it grew. */
  async function spend(key: string, amount: number, cap: number): Promise<boolean> {
    if (amount > cap) return false;
    const result = await db
      .prepare(
        `INSERT INTO stats_budget (key, used) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE SET used = used + excluded.used WHERE used + excluded.used <= ?3`
      )
      .bind(key, amount, cap)
      .run();
    return result.meta.changes === 1;
  }
  async function refund(key: string, amount: number): Promise<void> {
    await db.prepare('UPDATE stats_budget SET used = MAX(0, used - ?2) WHERE key = ?1').bind(key, amount).run();
  }
  return {
    async spendStratz(now, calls, hourCap, dayCap) {
      const day = `stratz:d:${dayOf(now)}`;
      if (!(await spend(day, calls, dayCap))) return false;
      if (await spend(`stratz:h:${hourOf(now)}`, calls, hourCap)) return true;
      await refund(day, calls);
      return false;
    },
    spendReads: (now, matches, dayCap) => spend(`read:d:${dayOf(now)}`, matches, dayCap),
    async stratzSpent(now) {
      const rows = await db
        .prepare('SELECT key, used FROM stats_budget WHERE key IN (?1, ?2)')
        .bind(`stratz:h:${hourOf(now)}`, `stratz:d:${dayOf(now)}`)
        .all<{ key: string; used: number }>();
      const reads = await db
        .prepare('SELECT used FROM stats_budget WHERE key = ?1')
        .bind(`read:d:${dayOf(now)}`)
        .first<{ used: number }>();
      const of = (prefix: string) => rows.results.find((row) => row.key.startsWith(prefix))?.used ?? 0;
      return { hour: of('stratz:h:'), day: of('stratz:d:'), reads: reads?.used ?? 0 };
    },
    async claimTurn(key, now, everyMs) {
      const result = await db
        .prepare(
          `INSERT INTO stats_state (key, value) VALUES (?1, ?2)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value WHERE value <= ?3`
        )
        .bind(key, now, now - everyMs)
        .run();
      return result.meta.changes === 1;
    },
    async stateValue(key) {
      const row = await db.prepare('SELECT value FROM stats_state WHERE key = ?1').bind(key).first<{ value: number }>();
      return row?.value ?? 0;
    },
    async setState(key, value) {
      await db
        .prepare(
          'INSERT INTO stats_state (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value'
        )
        .bind(key, value)
        .run();
    },
    async upsertLeaderboard(rows, now) {
      if (rows.length === 0) return 0;
      const columns = 5;
      const statements = chunks(rows, Math.floor(PARAMS_MAX / columns)).map((chunk) =>
        db
          .prepare(
            `INSERT INTO stats_accounts (account_id, source, leaderboard_rank, added_at, listed_at, next_scan_at)
             VALUES ${chunk
               .map(
                 (_, row) =>
                   `(?${row * columns + 1}, ?${row * columns + 2}, ?${row * columns + 3}, ?${row * columns + 4}, ?${row * columns + 4}, ?${row * columns + 5})`
               )
               .join(', ')}
             ON CONFLICT (account_id) DO UPDATE SET leaderboard_rank = excluded.leaderboard_rank,
               listed_at = excluded.listed_at, source = 'leaderboard'`
          )
          .bind(...chunk.flatMap((each) => [each.accountId, 'leaderboard', each.rank, now, now]))
      );
      const results = await db.batch(statements);
      return results.reduce((sum, result) => sum + result.meta.changes, 0);
    },
    async accountSets() {
      const rows = await db
        .prepare('SELECT account_id, leaderboard_rank FROM stats_accounts')
        .all<{ account_id: number; leaderboard_rank: number | null }>();
      const tracked = new Set<number>();
      const top = new Set<number>();
      for (const row of rows.results) {
        tracked.add(row.account_id);
        if (row.leaderboard_rank !== null) top.add(row.account_id);
      }
      return { tracked, top };
    },
    async claimAccounts(now, limit, leaseMs) {
      const rows = await db
        .prepare(
          `UPDATE stats_accounts SET next_scan_at = ?2
           WHERE account_id IN (SELECT account_id FROM stats_accounts WHERE next_scan_at <= ?1 ORDER BY next_scan_at LIMIT ?3)
             AND next_scan_at <= ?1
           RETURNING account_id`
        )
        .bind(now, now + leaseMs, limit)
        .all<{ account_id: number }>();
      return rows.results.map((row) => row.account_id);
    },
    async scanned(scans, now) {
      if (scans.length === 0) return;
      // Active players are scanned twice as often; a failure (private profile, unknown id) backs off a day.
      const statements = scans.map((scan) =>
        scan.failed
          ? db
              .prepare(
                'UPDATE stats_accounts SET errors = errors + 1, scanned_at = ?2, next_scan_at = ?3 WHERE account_id = ?1'
              )
              .bind(scan.accountId, now, now + DAY_MS)
          : db
              .prepare(
                `UPDATE stats_accounts SET scanned_at = ?2, next_scan_at = ?3, found = found + ?4,
                   last_match_at = MAX(COALESCE(last_match_at, 0), ?5) WHERE account_id = ?1`
              )
              .bind(scan.accountId, now, now + (scan.found > 0 ? 6 : 12) * HOUR_MS, scan.found, scan.newest ?? 0)
      );
      await db.batch(statements);
    },
    async enqueue(matches, now) {
      const byId = new Map<number, { matchId: number; startedAt: number; top: number }>();
      for (const each of matches) {
        const known = byId.get(each.matchId);
        byId.set(each.matchId, known === undefined ? each : { ...each, top: known.top + each.top });
      }
      const ids = [...byId.keys()];
      if (ids.length === 0) return 0;
      // Matches already kept or queued are skipped by a read, so a rolling relisting writes nothing for them.
      const known = new Set<number>();
      for (const chunk of chunks(ids, PARAMS_MAX / 2)) {
        const marks = chunk.map((_, index) => `?${index + 1}`).join(', ');
        const rows = await db
          .prepare(
            `SELECT match_id FROM stats_matches WHERE match_id IN (${marks})
             UNION SELECT match_id FROM stats_queue WHERE match_id IN (${marks})`
          )
          .bind(...chunk)
          .all<{ match_id: number }>();
        for (const row of rows.results) known.add(row.match_id);
      }
      const fresh = [...byId.values()].filter((each) => !known.has(each.matchId));
      if (fresh.length === 0) return 0;
      const columns = 4;
      const results = await db.batch(
        chunks(fresh, Math.floor(PARAMS_MAX / columns)).map((chunk) =>
          db
            .prepare(
              `INSERT OR IGNORE INTO stats_queue (match_id, started_at, next_at, top) VALUES ${placeholders(chunk.length, columns)}`
            )
            .bind(...chunk.flatMap((each) => [each.matchId, each.startedAt, now, each.top]))
        )
      );
      return results.reduce((sum, result) => sum + result.meta.changes, 0);
    },
    async claimReads(now, limit, retryMs) {
      // Out of tries: a marker like a dropped match. Markers past their window go.
      const [exhausted] = await db.batch([
        db
          .prepare(
            'UPDATE stats_queue SET dropped = 1, next_at = started_at + ?2 WHERE attempts >= 3 AND dropped = 0 AND next_at <= ?1'
          )
          .bind(now, MARKER_MS),
        db.prepare('DELETE FROM stats_queue WHERE dropped = 1 AND next_at <= ?1').bind(now)
      ]);
      const rows = await db
        .prepare(
          `UPDATE stats_queue SET next_at = ?2, attempts = attempts + 1
           WHERE match_id IN (SELECT match_id FROM stats_queue WHERE next_at <= ?1 AND dropped = 0 ORDER BY top DESC, next_at LIMIT ?3)
             AND next_at <= ?1 AND dropped = 0
           RETURNING match_id`
        )
        .bind(now, now + retryMs, limit)
        .all<{ match_id: number }>();
      return { ids: rows.results.map((row) => row.match_id), exhausted: exhausted?.meta.changes ?? 0 };
    },
    async release(ids, now) {
      if (ids.length === 0) return;
      await db.batch(
        chunks(ids, PARAMS_MAX - 1).map((chunk) =>
          db
            .prepare(
              `UPDATE stats_queue SET attempts = MAX(0, attempts - 1), next_at = ?1
               WHERE dropped = 0 AND match_id IN (${chunk.map((_, index) => `?${index + 2}`).join(', ')})`
            )
            .bind(now, ...chunk)
        )
      );
    },
    async store(kept, dropped, now) {
      const statements: D1PreparedStatement[] = [];
      // The hero list for the nightly snapshot and the purge: an ignored insert writes nothing.
      const heroIds = [...new Set(kept.flatMap((each) => each.players.map((player) => player.heroId)))];
      for (const chunk of chunks(heroIds, PARAMS_MAX))
        statements.push(
          db
            .prepare(`INSERT OR IGNORE INTO stats_heroes (hero_id) VALUES ${placeholders(chunk.length, 1)}`)
            .bind(...chunk)
        );
      for (const { match, players } of kept) {
        statements.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO stats_matches (match_id, started_at, minutes, patch, radiant_won, bracket, rank, region,
                 top_players, lanes, draft, stored_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
            )
            .bind(
              match.matchId,
              match.startedAt,
              match.minutes,
              match.patch,
              match.radiantWon ? 1 : 0,
              match.bracket,
              match.rank,
              match.region,
              match.topPlayers,
              match.lanes,
              match.draft,
              now
            )
        );
        for (const chunk of chunks(players, Math.floor(PARAMS_MAX / PLAYER_COLUMNS)))
          statements.push(
            db
              .prepare(
                `INSERT OR IGNORE INTO stats_players (hero_id, position, started_at, match_id, patch, account_id, tracked,
                   won, minutes, bracket, top_players, lane, kills, deaths, assists, gpm, xpm, damage, nw10, nw20, allies,
                   enemies, detail) VALUES ${placeholders(chunk.length, PLAYER_COLUMNS)}`
              )
              .bind(...chunk.flatMap(playerValues))
          );
      }
      const keptIds = kept.map((each) => each.match.matchId);
      for (const chunk of chunks(keptIds, PARAMS_MAX))
        statements.push(
          db
            .prepare(
              `DELETE FROM stats_queue WHERE match_id IN (${chunk.map((_, index) => `?${index + 1}`).join(', ')})`
            )
            .bind(...chunk)
        );
      for (const chunk of chunks(dropped, PARAMS_MAX - 1))
        statements.push(
          db
            .prepare(
              `UPDATE stats_queue SET dropped = 1, next_at = started_at + ?1
               WHERE match_id IN (${chunk.map((_, index) => `?${index + 2}`).join(', ')})`
            )
            .bind(MARKER_MS, ...chunk)
        );
      if (statements.length > 0) await db.batch(statements);
    },
    async addHealth(now, delta) {
      await db
        .prepare(
          `INSERT INTO stats_health (day, listed, read, kept, dropped, failed, calls, last_kept_at, last_error)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
           ON CONFLICT (day) DO UPDATE SET listed = listed + excluded.listed, read = read + excluded.read,
             kept = kept + excluded.kept, dropped = dropped + excluded.dropped, failed = failed + excluded.failed,
             calls = calls + excluded.calls,
             last_kept_at = MAX(COALESCE(last_kept_at, 0), COALESCE(excluded.last_kept_at, 0)),
             last_error = COALESCE(excluded.last_error, last_error)`
        )
        .bind(
          dayOf(now),
          delta.listed ?? 0,
          delta.read ?? 0,
          delta.kept ?? 0,
          delta.dropped ?? 0,
          delta.failed ?? 0,
          delta.calls ?? 0,
          delta.keptAt ?? null,
          delta.error ?? null
        )
        .run();
    },
    async health(day) {
      const row = await db
        .prepare(
          `SELECT day, listed, read, kept, dropped, failed, calls, last_kept_at, last_error FROM stats_health WHERE day = ?1`
        )
        .bind(day)
        .first<{
          day: number;
          listed: number;
          read: number;
          kept: number;
          dropped: number;
          failed: number;
          calls: number;
          last_kept_at: number | null;
          last_error: string | null;
        }>();
      return row === null
        ? null
        : {
            day: row.day,
            listed: row.listed,
            read: row.read,
            kept: row.kept,
            dropped: row.dropped,
            failed: row.failed,
            calls: row.calls,
            lastKeptAt: row.last_kept_at === 0 ? null : row.last_kept_at,
            lastError: row.last_error
          };
    },
    async purge(now, keepMs) {
      const claimed = await db
        .prepare(
          `INSERT INTO stats_state (key, value) VALUES ('purged_at', ?1)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value WHERE value <= ?2`
        )
        .bind(now, now - DAY_MS)
        .run();
      if (claimed.meta.changes !== 1) return false;
      const before = now - keepMs;
      const heroes = await db.prepare('SELECT hero_id FROM stats_heroes').all<{ hero_id: number }>();
      // Per hero: the key's range, so no delete scans the whole table (D1 runs one query at a time).
      const players = heroes.results.map((row) =>
        db.prepare('DELETE FROM stats_players WHERE hero_id = ?1 AND started_at < ?2').bind(row.hero_id, before)
      );
      for (const chunk of chunks(players, 50)) await db.batch(chunk);
      await db.batch([
        db.prepare('DELETE FROM stats_matches WHERE started_at < ?1').bind(before),
        db.prepare('DELETE FROM stats_queue WHERE started_at < ?1').bind(before),
        db
          .prepare(`DELETE FROM stats_budget WHERE key LIKE 'stratz:h:%' AND ${BUDGET_NUMBER} < ?1`)
          .bind(hourOf(now) - 48),
        db
          .prepare(`DELETE FROM stats_budget WHERE key NOT LIKE 'stratz:h:%' AND ${BUDGET_NUMBER} < ?1`)
          .bind(dayOf(now) - 7),
        db.prepare('DELETE FROM stats_health WHERE day < ?1').bind(dayOf(now) - 90),
        db.prepare('DELETE FROM stats_days WHERE day < ?1').bind(dayOf(now) - 400),
        db.prepare('DELETE FROM stats_accounts WHERE listed_at < ?1').bind(now - 7 * DAY_MS)
      ]);
      return true;
    },
    async currentPatch() {
      const row = await db
        .prepare('SELECT patch FROM stats_matches ORDER BY started_at DESC LIMIT 1')
        .first<{ patch: number }>();
      return row?.patch ?? 0;
    },
    async heroes() {
      const rows = await db.prepare('SELECT hero_id FROM stats_heroes ORDER BY hero_id').all<{ hero_id: number }>();
      return rows.results.map((row) => row.hero_id);
    },
    async heroRows(heroId, position, since, patch, limit) {
      const rows = await db
        .prepare(
          `SELECT ${ROW_COLUMNS} FROM stats_players
           WHERE hero_id = ?1 AND position = ?2 AND started_at >= ?3 AND patch = ?4
           ORDER BY started_at DESC LIMIT ?5`
        )
        .bind(heroId, position, since, patch, Math.min(limit, GAMES_MAX))
        .all<RawRow>();
      return rows.results.flatMap((row) => toRow(row) ?? []);
    },
    async baseRates(heroIds, since, patch) {
      const rates = new Map<string, { matches: number; wins: number }>();
      const sums = BANDS.map(
        (band) =>
          `SUM(CASE WHEN ${bandCondition(band)} THEN 1 ELSE 0 END) AS n_${band},
           SUM(CASE WHEN ${bandCondition(band)} THEN won ELSE 0 END) AS w_${band}`
      ).join(', ');
      // One key range per hero: no statement scans the whole table (D1 runs one query at a time).
      const statements = heroIds.map((heroId) =>
        db
          .prepare(
            `SELECT hero_id, position, ${sums} FROM stats_players
             WHERE hero_id = ?1 AND started_at >= ?2 AND patch = ?3 AND tracked = 0 GROUP BY position`
          )
          .bind(heroId, since, patch)
      );
      for (const batch of chunks(statements, 50))
        for (const result of await db.batch<Record<string, number>>(batch))
          for (const row of result.results)
            for (const band of BANDS)
              if ((row[`n_${band}`] ?? 0) > 0)
                rates.set(`${band}:${row.hero_id}:${row.position}`, {
                  matches: row[`n_${band}`] ?? 0,
                  wins: row[`w_${band}`] ?? 0
                });
      return rates;
    },
    async writeSnapshots(rows, now) {
      const columns = 9;
      const statements = chunks(rows, Math.floor(PARAMS_MAX / columns)).map((chunk) =>
        db
          .prepare(
            `INSERT INTO stats_snapshots (patch, hero_id, position, band, span, computed_at, matches, wins, data)
             VALUES ${placeholders(chunk.length, columns)}
             ON CONFLICT (patch, hero_id, position, band, span) DO UPDATE SET computed_at = excluded.computed_at,
               matches = excluded.matches, wins = excluded.wins, data = excluded.data`
          )
          .bind(
            ...chunk.flatMap((each) => [
              each.patch,
              each.heroId,
              each.position,
              each.band,
              each.span,
              now,
              each.matches,
              each.wins,
              each.data
            ])
          )
      );
      for (const chunk of chunks(statements, 50)) await db.batch(chunk);
    },
    async writeDays(rows) {
      const columns = 6;
      const statements = chunks(rows, Math.floor(PARAMS_MAX / columns)).map((chunk) =>
        db
          .prepare(
            `INSERT INTO stats_days (day, hero_id, position, band, matches, wins) VALUES ${placeholders(chunk.length, columns)}
             ON CONFLICT (day, hero_id, position, band) DO UPDATE SET matches = excluded.matches, wins = excluded.wins`
          )
          .bind(...chunk.flatMap((each) => [each.day, each.heroId, each.position, each.band, each.matches, each.wins]))
      );
      for (const chunk of chunks(statements, 50)) await db.batch(chunk);
    },
    async snapshot(patch, heroId, position, band, span) {
      const row = await db
        .prepare(
          `SELECT patch, hero_id, position, band, span, matches, wins, data FROM stats_snapshots
           WHERE patch = ?1 AND hero_id = ?2 AND position = ?3 AND band = ?4 AND span = ?5`
        )
        .bind(patch, heroId, position, band, span)
        .first<{
          patch: number;
          hero_id: number;
          position: number;
          band: Band;
          span: Span;
          matches: number;
          wins: number;
          data: string;
        }>();
      return row === null
        ? null
        : {
            patch: row.patch,
            heroId: row.hero_id,
            position: row.position,
            band: row.band,
            span: row.span,
            matches: row.matches,
            wins: row.wins,
            data: row.data
          };
    },
    async rows(heroId, position, since, band, limit) {
      const rows = await db
        .prepare(
          `SELECT ${ROW_COLUMNS} FROM stats_players
           WHERE hero_id = ?1 AND position = ?2 AND started_at >= ?3 AND ${bandCondition(band)}
           ORDER BY started_at DESC LIMIT ?4`
        )
        .bind(heroId, position, since, Math.min(limit, GAMES_MAX))
        .all<RawRow>();
      return rows.results.flatMap((row) => toRow(row) ?? []);
    }
  };
}

function playerValues(row: StatsPlayerRow): (number | string | null)[] {
  return [
    row.heroId,
    row.position,
    row.startedAt,
    row.matchId,
    row.patch,
    row.accountId,
    row.tracked ? 1 : 0,
    row.won ? 1 : 0,
    row.minutes,
    row.bracket,
    row.topPlayers,
    row.lane,
    row.kills,
    row.deaths,
    row.assists,
    row.gpm,
    row.xpm,
    row.damage,
    row.nw10,
    row.nw20,
    row.allies,
    row.enemies,
    JSON.stringify(row.detail)
  ];
}
