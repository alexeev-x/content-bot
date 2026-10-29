// What a match must be to enter the statistics, and its rows (plan `.logs/handoff/hero-matches-plan.md` §3).
// Probe 29.10.2026: 5% of sides came without five distinct positions, 2.4% of tracked players disconnected; such
// matches would put players on the wrong team or count games nobody finished, so they are dropped, never patched.

export interface MatchPlayerInput {
  accountId: number | null;
  radiant: boolean | null;
  heroId: number;
  position: number | null;
  lane: string | null;
  leaver: string | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  gpm: number | null;
  xpm: number | null;
  damage: number | null;
  items: number[];
  neutral: number | null;
  purchases: { itemId: number; second: number }[];
  skills: number[];
  networth: number[];
}

export interface MatchInput {
  id: number;
  startedAt: number | null;
  seconds: number | null;
  patch: number | null;
  radiantWon: boolean | null;
  bracket: number | null;
  rank: number | null;
  region: number | null;
  lobby: string | null;
  mode: string | null;
  parsed: boolean;
  lanes: { top: string | null; mid: string | null; bottom: string | null };
  draft: { heroId: number; pick: boolean; radiant: boolean | null; order: number | null }[];
  players: MatchPlayerInput[];
}

/** Why a read match stays out. */
export type DropReason =
  'not_parsed' | 'not_ranked' | 'low_bracket' | 'no_outcome' | 'short' | 'players' | 'positions' | 'leaver';

/** A player's compact detail: final items, neutral, purchases [item, minute], skill order (talents included). */
export interface PlayerDetail {
  i: number[];
  n: number | null;
  p: [number, number][];
  s: number[];
}

export interface StatsPlayerRow {
  heroId: number;
  position: number;
  /** UTC ms. */
  startedAt: number;
  matchId: number;
  patch: number;
  accountId: number | null;
  tracked: boolean;
  won: boolean;
  minutes: number;
  bracket: number;
  topPlayers: number;
  /** 1 won the lane, 0 even, -1 lost; null for the jungle, a roamer or an unknown outcome. */
  lane: -1 | 0 | 1 | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  gpm: number | null;
  xpm: number | null;
  damage: number | null;
  nw10: number | null;
  nw20: number | null;
  /** «heroId:position» of the four teammates and the five opponents. */
  allies: string;
  enemies: string;
  detail: PlayerDetail;
}

export interface StatsMatchRow {
  matchId: number;
  startedAt: number;
  minutes: number;
  patch: number;
  radiantWon: boolean;
  bracket: number;
  rank: number | null;
  region: number | null;
  topPlayers: number;
  lanes: string;
  draft: string;
}

export type KeepResult =
  { kept: true; match: StatsMatchRow; players: StatsPlayerRow[] } | { kept: false; reason: DropReason };

/** Games shorter than this are remakes or abandons: nothing about builds or win rates. */
export const MIN_MINUTES = 12;
/** STRATZ bracket 7 Divine, 8 Immortal: the statistics start at Divine. */
export const MIN_BRACKET = 7;
const LEAVERS = new Set(['ABANDONED', 'DISCONNECTED_TOO_LONG', 'AFK', 'NEVER_CONNECTED', 'NEVER_CONNECTED_TOO_LONG']);
/** Consumables after the horn say nothing about a build. */
const CONSUMABLES = new Set([38, 39, 40, 42, 43, 44, 46, 188, 216, 218, 237, 241, 1123, 4204, 4205, 4206]);
const PURCHASES_MAX = 120;

/** The player's own lane outcome from STRATZ's per-lane results (safe lane is bottom for Radiant, top for Dire). */
function laneOutcome(match: MatchInput, player: MatchPlayerInput): -1 | 0 | 1 | null {
  if (player.radiant === null) return null;
  const lane =
    player.lane === 'MID_LANE'
      ? match.lanes.mid
      : player.lane === 'SAFE_LANE'
        ? player.radiant
          ? match.lanes.bottom
          : match.lanes.top
        : player.lane === 'OFF_LANE'
          ? player.radiant
            ? match.lanes.top
            : match.lanes.bottom
          : null;
  if (lane === null || lane === undefined) return null;
  if (lane === 'TIE') return 0;
  const radiantWon = lane.startsWith('RADIANT');
  const direWon = lane.startsWith('DIRE');
  if (!radiantWon && !direWon) return null;
  return radiantWon === player.radiant ? 1 : -1;
}

const slot = (player: MatchPlayerInput) => `${player.heroId}:${player.position ?? 0}`;

/**
 * Checks a read match and turns it into rows. `tracked`: the accounts followed (their rows are flagged so the win rates
 * can skip them); `top`: accounts on a regional leaderboard.
 */
export function keepMatch(match: MatchInput, tracked: ReadonlySet<number>, top: ReadonlySet<number>): KeepResult {
  if (!match.parsed) return { kept: false, reason: 'not_parsed' };
  if (match.lobby !== 'RANKED' || match.mode !== 'ALL_PICK_RANKED') return { kept: false, reason: 'not_ranked' };
  if (match.bracket === null || match.bracket < MIN_BRACKET) return { kept: false, reason: 'low_bracket' };
  if (match.radiantWon === null || match.startedAt === null || match.seconds === null || match.patch === null)
    return { kept: false, reason: 'no_outcome' };
  const minutes = Math.round(match.seconds / 60);
  if (minutes < MIN_MINUTES) return { kept: false, reason: 'short' };
  const { players } = match;
  if (players.length !== 10 || players.some((player) => player.radiant === null))
    return { kept: false, reason: 'players' };
  for (const side of [true, false]) {
    const team = players.filter((player) => player.radiant === side);
    const positions = new Set(team.map((player) => player.position));
    if (team.length !== 5 || positions.size !== 5 || positions.has(null)) return { kept: false, reason: 'positions' };
  }
  if (players.some((player) => player.leaver !== null && LEAVERS.has(player.leaver)))
    return { kept: false, reason: 'leaver' };

  const startedAt = match.startedAt * 1000;
  const topPlayers = players.filter((player) => player.accountId !== null && top.has(player.accountId)).length;
  const radiantWon = match.radiantWon;
  const rows = players.map((player): StatsPlayerRow => ({
    heroId: player.heroId,
    position: player.position ?? 0,
    startedAt,
    matchId: match.id,
    patch: match.patch ?? 0,
    accountId: player.accountId,
    tracked: player.accountId !== null && tracked.has(player.accountId),
    won: player.radiant === radiantWon,
    minutes,
    bracket: match.bracket ?? 0,
    topPlayers,
    lane: laneOutcome(match, player),
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    gpm: player.gpm,
    xpm: player.xpm,
    damage: player.damage,
    nw10: player.networth[10] ?? null,
    nw20: player.networth[20] ?? null,
    allies: players
      .filter((other) => other !== player && other.radiant === player.radiant)
      .map(slot)
      .join(','),
    enemies: players
      .filter((other) => other.radiant !== player.radiant)
      .map(slot)
      .join(','),
    detail: {
      i: player.items.slice(0, 6),
      n: player.neutral,
      p: player.purchases
        .map((each): [number, number] => [each.itemId, Math.floor(each.second / 60)])
        .filter(([itemId, minute]) => minute < 0 || !CONSUMABLES.has(itemId))
        .slice(0, PURCHASES_MAX),
      s: player.skills.slice(0, 30)
    }
  }));
  return {
    kept: true,
    players: rows,
    match: {
      matchId: match.id,
      startedAt,
      minutes,
      patch: match.patch,
      radiantWon,
      bracket: match.bracket,
      rank: match.rank,
      region: match.region,
      topPlayers,
      lanes: JSON.stringify(match.lanes),
      draft: JSON.stringify(
        [...match.draft]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((each) => [each.heroId, each.pick ? 1 : 0, each.radiant === null ? null : each.radiant ? 1 : 0])
      )
    }
  };
}
