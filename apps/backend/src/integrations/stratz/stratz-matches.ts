import { z } from 'zod';
import { readCappedText } from '../../platform/http/read-capped-text';
import { boundDetail, causeDetail, readErrorDetail } from '../../platform/error-detail';
import { StratzError, STRATZ_TIMEOUT_MS } from './stratz-api';

// STRATZ reads of the hero statistics base (owner, 29.10.2026): the regional season leaderboards (whom to follow), a
// followed player's parsed ranked matches, and whole matches. Measured 29.10: twenty players' match lists fit one
// request (≈ 170 KB, < 1 s); `matches(ids:[…])` is admin-only, so whole matches are read as `match(id)` aliases, ten
// per request. One alias STRATZ cannot answer fails only itself: the others are kept.

const DIRECT = 'https://api.stratz.com/graphql';
const MAX_BODY_BYTES = 4_000_000;
/** Players per match-list request and matches per read (both measured on the live API, 29.10.2026). */
export const LIST_ACCOUNTS_MAX = 20;
export const READ_MATCHES_MAX = 10;
/** Leaderboard rows per request. */
export const LEADERBOARD_PAGE = 1000;
export const LEADERBOARD_DIVISIONS = ['EUROPE', 'AMERICAS', 'SE_ASIA', 'CHINA'] as const;
export type LeaderboardDivision = (typeof LEADERBOARD_DIVISIONS)[number];

/** A 429 carries STRATZ's `Retry-After` (seconds) when it sent one. */
export class StratzRateError extends StratzError {
  constructor(
    readonly retryAfterSeconds: number | null,
    detail?: string
  ) {
    super('STRATZ_RATE', 429, detail);
  }
}

export interface StratzListedMatch {
  matchId: number;
  /** UTC seconds. */
  startedAt: number;
}

export interface StratzFullPlayer {
  accountId: number | null;
  radiant: boolean | null;
  heroId: number;
  /** 1–5, or null when STRATZ has none. */
  position: number | null;
  /** SAFE_LANE, MID_LANE, OFF_LANE, JUNGLE, ROAMING … as STRATZ names it. */
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
  /** Purchases with the game second (negative before the horn). */
  purchases: { itemId: number; second: number }[];
  /** Ability and talent ids in the order the points were spent. */
  skills: number[];
  /** Net worth by minute. */
  networth: number[];
}

export interface StratzFullMatch {
  id: number;
  /** UTC seconds. */
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
  /** STRATZ's outcome per lane: TIE, RADIANT_VICTORY, RADIANT_STOMP, DIRE_VICTORY, DIRE_STOMP. */
  lanes: { top: string | null; mid: string | null; bottom: string | null };
  /** Picks and bans in draft order. */
  draft: { heroId: number; pick: boolean; radiant: boolean | null; order: number | null }[];
  players: StratzFullPlayer[];
}

export interface StratzMatchesApi {
  /** One page of a region's season leaderboard: account and place. */
  leaderboard(
    division: LeaderboardDivision,
    skip: number,
    signal?: AbortSignal
  ): Promise<{ accountId: number; rank: number }[]>;
  /**
   * Parsed ranked All Pick matches of each account since `since` (UTC seconds), at most 100 each. `failed`: accounts
   * STRATZ answered with an error (private profile, unknown id), so the caller can back them off.
   */
  playerMatches(
    accountIds: readonly number[],
    since: number,
    signal?: AbortSignal
  ): Promise<{ found: Map<number, StratzListedMatch[]>; failed: number[] }>;
  /** Whole matches; `missing`: ids STRATZ answered with null or an error. */
  readMatches(
    ids: readonly number[],
    signal?: AbortSignal
  ): Promise<{ matches: StratzFullMatch[]; missing: number[]; invalid: number[] }>;
}

const int = z.number().int();
const nullableInt = int.nullable().catch(null);
const nullableNumber = z.number().nullable().catch(null);
const nullableText = z.string().max(40).nullable().catch(null);

const leaderboardSchema = z.object({
  leaderboard: z.object({
    season: z.object({ players: z.array(z.object({ steamAccountId: int, rank: int })).max(LEADERBOARD_PAGE) })
  })
});

const listedSchema = z
  .object({
    steamAccountId: int,
    matches: z
      .array(z.object({ id: int, startDateTime: int }))
      .max(100)
      .catch([])
  })
  .nullable();

const playerSchema = z.object({
  steamAccountId: nullableInt,
  isRadiant: z.boolean().nullable().catch(null),
  heroId: int,
  position: z.string().max(20).nullable().catch(null),
  lane: nullableText,
  leaverStatus: nullableText,
  kills: nullableInt,
  deaths: nullableInt,
  assists: nullableInt,
  goldPerMinute: nullableInt,
  experiencePerMinute: nullableInt,
  heroDamage: nullableInt,
  item0Id: nullableInt,
  item1Id: nullableInt,
  item2Id: nullableInt,
  item3Id: nullableInt,
  item4Id: nullableInt,
  item5Id: nullableInt,
  neutral0Id: nullableInt,
  abilities: z
    .array(z.object({ abilityId: int, time: z.number().catch(0), level: z.number().catch(0) }))
    .max(60)
    .nullable()
    .catch(null),
  stats: z
    .object({
      // Long lists are cut, never refused: a long game must not lose its whole build (review 29.10.2026).
      itemPurchases: z
        .array(z.object({ time: z.number(), itemId: int }))
        .transform((list) => list.slice(0, 300))
        .nullable()
        .catch(null),
      // Consumed items show up as the buff they give, not reliably as a purchase (below); a few per player measured.
      matchPlayerBuffEvent: z
        .array(z.object({ time: z.number().catch(0), itemId: int.nullable().catch(null) }))
        .transform((list) => list.slice(0, 200))
        .nullable()
        .catch(null),
      networthPerMinute: z.array(z.number()).max(400).nullable().catch(null)
    })
    .nullable()
    .catch(null)
});

const matchSchema = z.object({
  id: int,
  startDateTime: nullableInt,
  durationSeconds: nullableInt,
  gameVersionId: nullableInt,
  didRadiantWin: z.boolean().nullable().catch(null),
  bracket: nullableInt,
  actualRank: nullableInt,
  regionId: nullableInt,
  lobbyType: nullableText,
  gameMode: nullableText,
  parsedDateTime: nullableNumber,
  topLaneOutcome: nullableText,
  midLaneOutcome: nullableText,
  bottomLaneOutcome: nullableText,
  pickBans: z
    .array(
      z.object({
        heroId: int.nullable().catch(null),
        isPick: z.boolean().catch(false),
        isRadiant: z.boolean().nullable().catch(null),
        order: nullableInt
      })
    )
    .max(40)
    .nullable()
    .catch(null),
  players: z.array(playerSchema).max(10)
});

const MATCH_FIELDS = `id startDateTime durationSeconds gameVersionId didRadiantWin bracket actualRank regionId lobbyType
  gameMode parsedDateTime topLaneOutcome midLaneOutcome bottomLaneOutcome pickBans { heroId isPick isRadiant order }
  players { steamAccountId isRadiant heroId position lane leaverStatus kills deaths assists goldPerMinute
  experiencePerMinute heroDamage item0Id item1Id item2Id item3Id item4Id item5Id neutral0Id abilities { abilityId time level }
  stats { itemPurchases { time itemId } matchPlayerBuffEvent { time itemId } networthPerMinute } }`.replace(
  /\s+/gu,
  ' '
);

/**
 * Aghanim's Shard, Aghanim's Blessing and Moon Shard: STRATZ's purchase list mostly lacks them (2 of 60 players in a
 * 29.10.2026 sample, against 27 in the buff events), so the first buff of each counts as its purchase.
 */
const CONSUMED_ITEMS = new Set([609, 271, 247]);

function purchasesOf(stats: z.infer<typeof playerSchema>['stats']): { itemId: number; second: number }[] {
  const bought = (stats?.itemPurchases ?? []).map((each) => ({ itemId: each.itemId, second: Math.round(each.time) }));
  const seen = new Set(bought.map((each) => each.itemId));
  for (const buff of stats?.matchPlayerBuffEvent ?? [])
    if (buff.itemId !== null && CONSUMED_ITEMS.has(buff.itemId) && !seen.has(buff.itemId)) {
      seen.add(buff.itemId);
      bought.push({ itemId: buff.itemId, second: Math.round(buff.time) });
    }
  return bought.sort((a, b) => a.second - b.second);
}

const positionOf = (value: string | null) => Number(/^POSITION_([1-5])$/u.exec(value ?? '')?.[1] ?? 0) || null;

function toMatch(match: z.infer<typeof matchSchema>): StratzFullMatch {
  return {
    id: match.id,
    startedAt: match.startDateTime,
    seconds: match.durationSeconds,
    patch: match.gameVersionId,
    radiantWon: match.didRadiantWin,
    bracket: match.bracket,
    rank: match.actualRank,
    region: match.regionId,
    lobby: match.lobbyType,
    mode: match.gameMode,
    parsed: match.parsedDateTime !== null,
    lanes: { top: match.topLaneOutcome, mid: match.midLaneOutcome, bottom: match.bottomLaneOutcome },
    draft: (match.pickBans ?? []).flatMap((each) =>
      each.heroId === null
        ? []
        : [{ heroId: each.heroId, pick: each.isPick, radiant: each.isRadiant, order: each.order }]
    ),
    players: match.players.map((player) => ({
      accountId: player.steamAccountId,
      radiant: player.isRadiant,
      heroId: player.heroId,
      position: positionOf(player.position),
      lane: player.lane,
      leaver: player.leaverStatus,
      kills: player.kills,
      deaths: player.deaths,
      assists: player.assists,
      gpm: player.goldPerMinute,
      xpm: player.experiencePerMinute,
      damage: player.heroDamage,
      items: [player.item0Id, player.item1Id, player.item2Id, player.item3Id, player.item4Id, player.item5Id].filter(
        (item): item is number => item !== null && item > 0
      ),
      neutral: player.neutral0Id !== null && player.neutral0Id > 0 ? player.neutral0Id : null,
      purchases: purchasesOf(player.stats),
      // In the order the points were spent: `level` is the ability's own level, so it cannot order them.
      skills: [...(player.abilities ?? [])]
        .sort((a, b) => a.time - b.time || a.level - b.level)
        .map((each) => each.abilityId),
      networth: (player.stats?.networthPerMinute ?? []).map((each) => Math.round(each))
    }))
  };
}

/** Ids only: an alias name never carries text from outside. */
const ids = (values: readonly number[], max: number) => {
  const unique = [...new Set(values.map((each) => Math.trunc(each)))].filter((each) => each > 0);
  if (unique.length > max) throw new StratzError('STRATZ_SHAPE', null, `больше ${max} id в одном запросе`);
  return unique;
};

/** `bridgeUrl`: the stats bridge's origin (STRATZ refuses Cloudflare's addresses); without it STRATZ is called directly. */
export function createStratzMatches(input: {
  token: string;
  bridgeUrl?: string;
  fetchImpl?: typeof fetch;
}): StratzMatchesApi {
  const endpoint = input.bridgeUrl === undefined ? DIRECT : `${input.bridgeUrl.replace(/\/+$/u, '')}/stratz/graphql`;
  const fetchImpl = input.fetchImpl ?? fetch;

  /** The parsed `data` and the GraphQL errors' alias names (the first path element) with their messages. */
  async function post(
    text: string,
    signal?: AbortSignal
  ): Promise<{ data: Record<string, unknown> | null; errors: { alias: string | null; message: string }[] }> {
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${input.token}`,
          'user-agent': 'STRATZ_API'
        },
        body: JSON.stringify({ query: text }),
        signal: signal ?? AbortSignal.timeout(STRATZ_TIMEOUT_MS)
      });
    } catch (error) {
      throw new StratzError('STRATZ_FETCH', null, causeDetail(error));
    }
    if (response.status === 401 || response.status === 403) {
      const byGateway = (response.headers.get('www-authenticate') ?? '').toLowerCase().includes('kong');
      throw new StratzError(
        byGateway ? 'STRATZ_TOKEN' : 'STRATZ_BLOCKED',
        response.status,
        await readErrorDetail(response)
      );
    }
    if (response.status === 429) {
      const after = Number(response.headers.get('retry-after'));
      throw new StratzRateError(Number.isFinite(after) && after > 0 ? after : null, await readErrorDetail(response));
    }
    if (!response.ok) throw new StratzError('STRATZ_HTTP', response.status, await readErrorDetail(response));
    const body = await readCappedText(response, MAX_BODY_BYTES);
    if (body === null) throw new StratzError('STRATZ_SHAPE', null, `ответ больше ${MAX_BODY_BYTES} байт`);
    let json: { data?: unknown; errors?: unknown };
    try {
      json = JSON.parse(body) as { data?: unknown; errors?: unknown };
    } catch {
      throw new StratzError('STRATZ_SHAPE', null, 'ответ не JSON');
    }
    const errors = (Array.isArray(json.errors) ? json.errors : []).map((each) => {
      const error = each as { message?: unknown; path?: unknown };
      const first = Array.isArray(error.path) ? error.path[0] : null;
      return {
        alias: typeof first === 'string' ? first : null,
        message: boundDetail(typeof error.message === 'string' ? error.message : 'ошибка GraphQL')
      };
    });
    const data = json.data !== null && typeof json.data === 'object' ? (json.data as Record<string, unknown>) : null;
    // No data at all: the whole query was refused (a field STRATZ no longer has, a limit), so nothing is partial.
    if (data === null)
      throw new StratzError('STRATZ_SHAPE', null, errors.map((each) => each.message).join('; ') || 'нет data');
    return { data, errors };
  }

  return {
    async leaderboard(division, skip, signal) {
      const from = Math.max(0, Math.trunc(skip));
      const { data } = await post(
        `{ leaderboard { season(request: { leaderBoardDivision: ${division} }) { players(take: ${LEADERBOARD_PAGE}, skip: ${from}) { steamAccountId rank } } } }`,
        signal
      );
      const parsed = leaderboardSchema.safeParse(data);
      if (!parsed.success) throw new StratzError('STRATZ_SHAPE', null, 'лидерборд: неожиданный ответ');
      return parsed.data.leaderboard.season.players.map((each) => ({
        accountId: each.steamAccountId,
        rank: each.rank
      }));
    },
    async playerMatches(accountIds, since, signal) {
      const wanted = ids(accountIds, LIST_ACCOUNTS_MAX);
      const found = new Map<number, StratzListedMatch[]>();
      if (wanted.length === 0) return { found, failed: [] };
      const from = Math.max(0, Math.trunc(since));
      const { data } = await post(
        `{ ${wanted
          .map(
            (id, index) =>
              `a${index}: player(steamAccountId: ${id}) { steamAccountId matches(request: { isParsed: true, lobbyTypeIds: [7], gameModeIds: [22], startDateTime: ${from}, take: 100 }) { id startDateTime } }`
          )
          .join(' ')} }`,
        signal
      );
      const failed: number[] = [];
      wanted.forEach((id, index) => {
        const parsed = listedSchema.safeParse(data?.[`a${index}`] ?? null);
        if (!parsed.success || parsed.data === null) {
          failed.push(id);
          return;
        }
        found.set(
          id,
          parsed.data.matches.map((each) => ({ matchId: each.id, startedAt: each.startDateTime }))
        );
      });
      return { found, failed };
    },
    async readMatches(matchIds, signal) {
      const wanted = ids(matchIds, READ_MATCHES_MAX);
      if (wanted.length === 0) return { matches: [], missing: [], invalid: [] };
      const { data } = await post(
        `{ ${wanted.map((id, index) => `m${index}: match(id: ${id}) { ${MATCH_FIELDS} }`).join(' ')} }`,
        signal
      );
      const matches: StratzFullMatch[] = [];
      const missing: number[] = [];
      const invalid: number[] = [];
      wanted.forEach((id, index) => {
        const raw = data?.[`m${index}`] ?? null;
        if (raw === null) {
          missing.push(id);
          return;
        }
        const parsed = matchSchema.safeParse(raw);
        if (parsed.success) matches.push(toMatch(parsed.data));
        else invalid.push(id);
      });
      return { matches, missing, invalid };
    }
  };
}
