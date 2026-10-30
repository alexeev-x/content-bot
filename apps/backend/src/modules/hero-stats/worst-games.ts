import { z } from 'zod';

// «Пидорок дня» reads yesterday's lost games of non-followed players from the statistics base (migrations-stats/0001).
// No account, match id, region or time leaves this file: the match id is a join key inside the statements only.
// `stats_players` is keyed (hero_id, position, started_at, match_id), so a day is read as a key range per hero and
// position (the hero list is the small `stats_heroes` table), never as a table scan.

/** One lost game with the facts the score and the evidence need, and nothing that names the player or the match. */
export interface WorstGame {
  heroId: number;
  position: number;
  minutes: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number | null;
  nw20: number | null;
  lane: -1 | 0 | 1 | null;
  /** [item id, minute] pairs. */
  purchases: [number, number][];
  /** Final items (item ids). */
  items: number[];
  /** The neutral item (id), when the player had one. */
  neutral: number | null;
  /** Net worth at 20 minutes of the player's four team-mates, by position. */
  allyNw20: { position: number; nw20: number }[];
  /** Damage of all ten players of the match, the player's own included. */
  damages: number[];
}

export interface PositionMedians {
  position: number;
  deaths: number;
  kills: number;
  assists: number;
  nw20: number | null;
}

export interface WorstGames {
  /** Matches kept for the day (Divine and Immortal). */
  dayMatches: number;
  games: WorstGame[];
  medians: PositionMedians[];
}

/** The day's rows the medians are counted from: every fourth match by id, an even sample of any hero or position. */
const SAMPLE_ROWS_MAX = 15_000;
const CANDIDATES_MAX = 40;
const WIDE_MAX = 600;

const DAY_ROWS = `stats_players
  WHERE hero_id IN (SELECT hero_id FROM stats_heroes) AND position IN (1, 2, 3, 4, 5)
    AND started_at >= ?1 AND started_at < ?2 AND tracked = 0`;

const candidateRow = z.object({
  hero_id: z.number().int(),
  position: z.number().int(),
  match_id: z.number().int(),
  started_at: z.number().int(),
  minutes: z.number(),
  kills: z.number(),
  deaths: z.number(),
  assists: z.number(),
  damage: z.number().nullable(),
  nw20: z.number().nullable(),
  lane: z.number().nullable(),
  allies: z.string(),
  enemies: z.string(),
  detail: z.string(),
  day_matches: z.number()
});

const sampleRow = z.object({
  position: z.number().int(),
  deaths: z.number().nullable(),
  kills: z.number().nullable(),
  assists: z.number().nullable(),
  nw20: z.number().nullable()
});

const mateRow = z.object({
  n: z.number().int(),
  ally: z.number().int(),
  position: z.number().int(),
  damage: z.number().nullable(),
  nw20: z.number().nullable()
});

const itemIds = z.array(z.number().int()).max(9);
const neutralId = z.number().int().nullable();
const purchases = z.array(z.tuple([z.number().int(), z.number().int()])).max(300);

function detailPart(detail: string, key: 'p' | 'i' | 'n'): unknown {
  try {
    return (JSON.parse(detail) as Record<string, unknown>)[key] ?? (key === 'n' ? null : []);
  } catch {
    return key === 'n' ? null : [];
  }
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

export function positionMedians(rows: readonly z.infer<typeof sampleRow>[]): PositionMedians[] {
  const out: PositionMedians[] = [];
  for (let position = 1; position <= 5; position += 1) {
    const own = rows.filter((row) => row.position === position);
    if (own.length === 0) continue;
    const of = (pick: (row: z.infer<typeof sampleRow>) => number | null) => own.flatMap((row) => pick(row) ?? []);
    const nw = of((row) => row.nw20);
    out.push({
      position,
      deaths: median(of((row) => row.deaths)),
      kills: median(of((row) => row.kills)),
      assists: median(of((row) => row.assists)),
      nw20: nw.length === 0 ? null : median(nw)
    });
  }
  return out;
}

/** `hero:position` slots of the `allies` / `enemies` columns. */
function slots(text: string): [number, number][] {
  return text.split(',').flatMap((slot): [number, number][] => {
    const [hero, position] = slot.split(':').map(Number);
    return Number.isInteger(hero) && Number.isInteger(position) ? [[hero as number, position as number]] : [];
  });
}

function gameOf(row: z.infer<typeof candidateRow>, others: z.infer<typeof mateRow>[]): WorstGame {
  const bought = purchases.safeParse(detailPart(row.detail, 'p'));
  const items = itemIds.safeParse(detailPart(row.detail, 'i'));
  const neutral = neutralId.safeParse(detailPart(row.detail, 'n'));
  return {
    heroId: row.hero_id,
    position: row.position,
    minutes: row.minutes,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    damage: row.damage,
    nw20: row.nw20,
    lane: row.lane === 1 || row.lane === 0 || row.lane === -1 ? row.lane : null,
    purchases: bought.success ? bought.data : [],
    items: items.success ? items.data : [],
    neutral: neutral.success ? neutral.data : null,
    allyNw20: others.flatMap((mate) =>
      mate.ally === 1 && mate.nw20 !== null ? [{ position: mate.position, nw20: mate.nw20 }] : []
    ),
    damages: [row.damage, ...others.map((mate) => mate.damage)].flatMap((value) => value ?? [])
  };
}

/**
 * The worst lost games of `[sinceMs, untilMs)`: untracked players' lost games of 25+ minutes with 8+ deaths, the
 * deadliest `limit` of them, with the day's medians per position and the match's other players' numbers. Three
 * statements; the second never waits for the first. `wide`: every lost game of 25+ minutes in an even sample (for a
 * build to be judged on its items, deaths aside), up to `limit` rows, without the match's other players.
 */
export async function readWorstGames(
  db: D1Database,
  sinceMs: number,
  untilMs: number,
  limit: number,
  wide = false
): Promise<WorstGames> {
  const [candidates, sample] = await db.batch([
    db
      .prepare(
        `SELECT hero_id, position, match_id, started_at, minutes, kills, deaths, assists, damage, nw20, lane, allies,
                enemies, detail,
                (SELECT COUNT(*) FROM stats_matches WHERE started_at >= ?1 AND started_at < ?2) AS day_matches
         FROM ${DAY_ROWS} AND won = 0 AND minutes >= 25 AND kills IS NOT NULL AND assists IS NOT NULL
           AND deaths >= ?4 AND match_id % ?5 = 0
         ORDER BY deaths DESC, minutes DESC LIMIT ?3`
      )
      .bind(
        sinceMs,
        untilMs,
        Math.min(Math.max(limit, 1), wide ? WIDE_MAX : CANDIDATES_MAX),
        wide ? 0 : 8,
        wide ? 4 : 1
      ),
    db
      .prepare(`SELECT position, deaths, kills, assists, nw20 FROM ${DAY_ROWS} AND match_id % 4 = 0 LIMIT ?3`)
      .bind(sinceMs, untilMs, SAMPLE_ROWS_MAX)
  ]);
  const rows = candidates?.results.map((row) => candidateRow.parse(row)) ?? [];
  const medians = positionMedians((sample?.results ?? []).map((row) => sampleRow.parse(row)));
  if (rows.length === 0) return { dayMatches: 0, games: [], medians };
  if (wide) return { dayMatches: rows[0]?.day_matches ?? 0, games: rows.map((row) => gameOf(row, [])), medians };

  // The other nine players of each match by their exact key: one JSON parameter, one key probe each.
  const keys = rows.flatMap((row, n) => [
    ...slots(row.allies).map(([hero, position]) => [n, 1, hero, position, row.started_at, row.match_id]),
    ...slots(row.enemies).map(([hero, position]) => [n, 0, hero, position, row.started_at, row.match_id])
  ]);
  const mates = await db
    .prepare(
      `WITH k AS (SELECT json_extract(value, '$[0]') AS n, json_extract(value, '$[1]') AS ally,
                         json_extract(value, '$[2]') AS h, json_extract(value, '$[3]') AS p,
                         json_extract(value, '$[4]') AS s, json_extract(value, '$[5]') AS m
                  FROM json_each(?1))
       SELECT k.n AS n, k.ally AS ally, p.position AS position, p.damage AS damage, p.nw20 AS nw20
       FROM k JOIN stats_players p ON p.hero_id = k.h AND p.position = k.p AND p.started_at = k.s AND p.match_id = k.m`
    )
    .bind(JSON.stringify(keys))
    .all();
  const around = mates.results.map((row) => mateRow.parse(row));

  const games = rows.map((row, n) =>
    gameOf(
      row,
      around.filter((mate) => mate.n === n)
    )
  );
  return { dayMatches: rows[0]?.day_matches ?? 0, games, medians };
}
