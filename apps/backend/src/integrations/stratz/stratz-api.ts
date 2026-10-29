import { z } from 'zod';
import { readCappedText } from '../../platform/http/read-capped-text';
import { causeDetail, readErrorDetail, schemaDetail } from '../../platform/error-detail';

// STRATZ GraphQL with the owner's free token (`STRATZ_TOKEN`, owner 25.10.2026): pick and win rates by rank, item
// purchases by minute, win rate by game length and by position. STRATZ refuses Cloudflare's addresses (403 without
// its gateway's header), so the Worker goes through the owner's stats bridge (`bridge/stats-bridge`), which holds no
// keys: the token travels in this request and the bridge passes it on. STRATZ asks for the «STRATZ_API» user agent.

export const STRATZ_TIMEOUT_MS = 20_000;
const DIRECT = 'https://api.stratz.com/graphql';
const MAX_BODY_BYTES = 1_000_000;

/** STRATZ_TOKEN: STRATZ's gateway refused the key; STRATZ_BLOCKED: a 403 without it, the address itself was refused. */
export type StratzErrorCode =
  'STRATZ_FETCH' | 'STRATZ_TOKEN' | 'STRATZ_BLOCKED' | 'STRATZ_RATE' | 'STRATZ_HTTP' | 'STRATZ_SHAPE';

export class StratzError extends Error {
  constructor(
    readonly code: StratzErrorCode,
    readonly httpStatus: number | null = null,
    /** The provider's own error text, bounded and redacted (`platform/error-detail.ts`). */
    readonly detail?: string
  ) {
    super(code);
    this.name = 'StratzError';
  }
}

/** 1 Рекрут … 8 Титан, as STRATZ names them. */
const BRACKETS: Record<number, string> = {
  1: 'HERALD',
  2: 'GUARDIAN',
  3: 'CRUSADER',
  4: 'ARCHON',
  5: 'LEGEND',
  6: 'ANCIENT',
  7: 'DIVINE',
  8: 'IMMORTAL'
};

const count = z.coerce.number().nonnegative().catch(0);
const winRowSchema = z.object({ heroId: z.number().int(), week: z.number().int(), matchCount: count, winCount: count });
const purchaseSchema = z.object({
  itemId: z.number().int(),
  time: z.coerce.number().catch(0),
  matchCount: count,
  winCount: count
});
const startSchema = z.object({
  itemId: z.number().int(),
  instance: z.coerce.number().int().positive().catch(1),
  matchCount: count,
  winCount: count
});
const talentSchema = z.object({ abilityId: z.number().int(), matchCount: count, winCount: count });
const neutralSchema = z.object({
  itemId: z.number().int(),
  // The dotaconstants items carry a neutral tier for a few of the items only; STRATZ names its own.
  item: z
    .object({
      stat: z
        .object({ neutralItemTier: z.string().max(20).nullable().catch(null) })
        .nullable()
        .catch(null)
    })
    .nullable()
    .catch(null),
  matchCount: count,
  winCount: count
});
const matchupSchema = z.object({
  vs: z.array(z.object({ heroId2: z.number().int(), matchCount: count, winCount: count })).max(300)
});
// «Гайд на героя» sample (owner, 27.10.2026, live on STRATZ): `heroStats.guide` answers ten matches at most and leaves
// `matchPlayer` null, but different filters give different matches, so one request with a `guide` alias per filter
// gathers the candidates, and `match(id) { players(steamAccountId) }` aliases give each player's own details.
const GUIDE_TARGET = 100;
const GUIDE_MIN_NEWEST = 30;
/** The stats bridge refuses a query over 4000 characters (bridge/stats-bridge): a read is split into requests under it. */
const QUERY_MAX_CHARS = 3900;
const DETAIL_BATCH = 10;
const STRATZ_GAP_MS = 1200;
/** Opponents whose filtered lists widen the candidates; the hero itself is skipped. */
const GUIDE_OPPONENTS = [
  1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 13, 14, 16, 18, 19, 20, 21, 22, 23, 25, 26, 27, 28, 29, 30, 31, 32, 34, 35, 36, 37,
  38, 39, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51
];
const slot = z.number().int().nullable().catch(null);
/** Splits aliased fields into groups whose query text stays under `limit` characters. */
function chunked(parts: string[], limit: number): string[][] {
  const groups: string[][] = [];
  let size = 0;
  for (const part of parts) {
    const last = groups[groups.length - 1];
    if (last === undefined || size + part.length + 1 > limit - 40) {
      groups.push([part]);
      size = part.length;
    } else {
      last.push(part);
      size += part.length + 1;
    }
  }
  return groups;
}
// `guide` answers a list (one HeroGuideListType) under each alias.
const candidateSchema = z.record(
  z.string(),
  z
    .array(
      z.object({
        guides: z
          .array(
            z.object({
              matchId: z.number().int(),
              steamAccountId: z.number().int(),
              match: z
                .object({
                  startDateTime: z.number().nullable().catch(null),
                  gameVersionId: z.number().int().nullable().catch(null)
                })
                .nullable()
                .catch(null)
            })
          )
          .max(50)
          .catch([])
      })
    )
    .max(5)
    .catch([])
);
const detailSchema = z.record(
  z.string(),
  z
    .object({
      gameVersionId: z.number().int().nullable().catch(null),
      durationSeconds: z.number().int().nonnegative().nullable().catch(null),
      players: z
        .array(
          z.object({
            heroId: z.number().int().nullable().catch(null),
            isVictory: z.boolean().nullable().catch(null),
            position: z.string().max(20).nullable().catch(null),
            item0Id: slot,
            item1Id: slot,
            item2Id: slot,
            item3Id: slot,
            item4Id: slot,
            item5Id: slot,
            neutral0Id: slot,
            abilities: z
              .array(z.object({ abilityId: z.number().int(), time: z.number().catch(0), level: z.number().catch(0) }))
              .max(60)
              .nullable()
              .catch(null),
            stats: z
              .object({
                itemPurchases: z
                  .array(z.object({ time: z.number(), itemId: z.number().int() }))
                  .max(500)
                  .nullable()
                  .catch(null),
                // The neutral slot minute by minute: every tier's item, not only the one left at the end.
                inventoryReport: z
                  .array(z.object({ neutral0: z.object({ itemId: z.number().int() }).nullable().catch(null) }))
                  .max(240)
                  .nullable()
                  .catch(null)
              })
              .nullable()
              .catch(null)
          })
        )
        .max(10)
        .catch([])
    })
    .nullable()
    .catch(null)
);
const dayRowSchema = z.object({ day: z.number().int(), matchCount: count, winCount: count });
// Rubric 21 «Тир-лист» reads. `winWeek` takes `positionIds` (the guide's `winDay` does too). The lane, length and ban
// reads follow STRATZ's generated schema (STRATZ_Models, read 28.10.2026: `laneOutcome` rows are pairs heroId1 vs
// heroId2, length is `stats(groupByTime)`, bans are `banDay`) but are not yet checked against a live reply; a reply
// that does not parse is a STRATZ_SHAPE and the rubric's look then says «Нет данных» instead of drawing guesses.
const lengthSchema = z.object({
  heroId: z.number().int(),
  position: z.string().max(20),
  time: z.coerce.number().nonnegative().catch(0),
  matchCount: count,
  winCount: count
});
const positionPlace = (position: string | null) => Number(/POSITION_(\d)/u.exec(position ?? '')?.[1] ?? 0);
const positionSchema = z.object({
  heroId: z.number().int(),
  position: z.string().max(20),
  matchCount: count,
  winCount: count
});

/** One player's match as a guide sample row; `purchases` is null when the reply carried none. */
export interface StratzGuideMatch {
  victory: boolean;
  startedAt: number | null;
  patch: number | null;
  /** The match's length in minutes; null when STRATZ leaves it out. */
  minutes: number | null;
  items: number[];
  /** The neutral item slot at the end of the match. */
  neutral: number | null;
  /** Every neutral item the slot held during the match. */
  neutralsHeld: number[];
  purchases: { itemId: number; minute: number }[] | null;
  abilities: { abilityId: number; time: number; level: number }[];
}

export interface StratzApi {
  /**
   * Every hero's matches and wins for the last `weeks` weeks (newest first per hero), in one bracket or, with null, in
   * every bracket in one request: eight at once got STRATZ_BLOCKED on DEV (27.10.2026).
   */
  heroWeeks(
    bracket: number | null,
    weeks: number,
    signal?: AbortSignal
  ): Promise<{ heroId: number; week: number; matches: number; wins: number }[]>;
  /** A hero's item purchases by minute with the wins of the matches they were bought in. */
  heroPurchases(
    heroId: number,
    signal?: AbortSignal
  ): Promise<{ itemId: number; minute: number; matches: number; wins: number }[]>;
  /**
   * A hero's matches and wins at one position on each of the newest days STRATZ has counted (Divine and Immortal).
   * Unlike `stats`, whose sample leans to wins (Techies 61.7%, 28.10.2026), it agrees with Dota2ProTracker.
   */
  heroPositionDays(
    heroId: number,
    position: number,
    days: number,
    signal?: AbortSignal
  ): Promise<{ day: number; matches: number; wins: number }[]>;
  /** Every hero's matches and wins at one position for the last `weeks` weeks in a bracket (null: every bracket), newest first. */
  positionWeeks(
    bracket: number | null,
    position: number,
    weeks: number,
    signal?: AbortSignal
  ): Promise<{ heroId: number; week: number; matches: number; wins: number }[]>;
  /** Every hero's matches and wins by position and match length (Divine and Immortal); `minute` is the length bin's start. */
  lengthRates(
    position: number,
    signal?: AbortSignal
  ): Promise<{ heroId: number; position: number; minute: number; matches: number; wins: number }[]>;
  /** Every hero's matches and wins by position 1–5 (Divine and Immortal). */
  positions(signal?: AbortSignal): Promise<{ heroId: number; position: number; matches: number; wins: number }[]>;
  /** A hero's starting buys at one position (1–5), each item with its copy number. */
  startingItems(
    heroId: number,
    position: number,
    signal?: AbortSignal
  ): Promise<{ itemId: number; instance: number; matches: number; wins: number }[]>;
  /** A hero's item purchases by minute at one position. */
  positionPurchases(
    heroId: number,
    position: number,
    signal?: AbortSignal
  ): Promise<{ itemId: number; minute: number; matches: number; wins: number }[]>;
  /** The neutral items a hero's players held at one position, each with STRATZ's own tier. */
  neutralItems(
    heroId: number,
    position: number,
    signal?: AbortSignal
  ): Promise<{ itemId: number; tier: number | null; matches: number; wins: number }[]>;
  /** How often each talent (by ability id) was learnt at one position. */
  talents(
    heroId: number,
    position: number,
    signal?: AbortSignal
  ): Promise<{ abilityId: number; matches: number; wins: number }[]>;
  /** A hero's matches and wins against every other hero. */
  matchups(heroId: number, signal?: AbortSignal): Promise<{ heroId: number; matches: number; wins: number }[]>;
  /**
   * A hero's recent matches at one position: about a hundred candidates from `guide` lists under several filters, then
   * per match the player's outcome, final inventory, abilities and, with `withPurchases`, every item purchase. Only the
   * newest patch's players whose own position and hero match are kept. `fetched`: candidates read; `total`: found.
   */
  guideSample(
    heroId: number,
    position: number,
    withPurchases: boolean,
    signal?: AbortSignal
  ): Promise<{
    fetched: number;
    total: number;
    matches: StratzGuideMatch[];
    positions: Record<string, number>;
  }>;
}

/** Matches per guide sample and opponents per matchup read: both bound the reply. */
const MATCHUP_TAKE = 130;

/** `bridgeUrl`: the stats bridge's origin; without it STRATZ is called directly (it works from any non-Cloudflare host). */
/**
 * `cache`: answers kept by query text and reused (STRATZ's aggregates change weekly); only a body that parsed is kept,
 * so an error is never repeated from the cache.
 */
export function createStratzApi(input: {
  token: string;
  bridgeUrl?: string;
  fetchImpl?: typeof fetch;
  cache?: { get(key: string): Promise<string | null>; put(key: string, body: string): Promise<void> };
}): StratzApi {
  const endpoint = input.bridgeUrl === undefined ? DIRECT : `${input.bridgeUrl.replace(/\/+$/, '')}/stratz/graphql`;
  const fetchImpl = input.fetchImpl ?? fetch;
  async function query<T>(
    text: string,
    pick: (data: unknown) => unknown,
    schema: z.ZodType<T>,
    signal?: AbortSignal
  ): Promise<T[]> {
    const cached = (await input.cache?.get(text)) ?? null;
    if (cached !== null) {
      const fromCache = parseRows(cached, pick, schema);
      if (fromCache !== null) return fromCache;
    }
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
      // STRATZ's gateway (Kong) names itself when it refuses a key; a refusal without that header is not about the key.
      const byGateway = (response.headers.get('www-authenticate') ?? '').toLowerCase().includes('kong');
      throw new StratzError(
        byGateway ? 'STRATZ_TOKEN' : 'STRATZ_BLOCKED',
        response.status,
        await readErrorDetail(response)
      );
    }
    if (response.status === 429) throw new StratzError('STRATZ_RATE', 429, await readErrorDetail(response));
    if (!response.ok) throw new StratzError('STRATZ_HTTP', response.status, await readErrorDetail(response));
    const body = await readCappedText(response, MAX_BODY_BYTES);
    if (body === null) throw new StratzError('STRATZ_SHAPE', null, `ответ больше ${MAX_BODY_BYTES} байт`);
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new StratzError('STRATZ_SHAPE', null, 'ответ не JSON');
    }
    const rows = pick((json as { data?: unknown }).data);
    const parsed = z.array(schema).max(5000).safeParse(rows);
    if (!parsed.success) throw new StratzError('STRATZ_SHAPE', null, schemaDetail(parsed.error));
    await input.cache?.put(text, body);
    return parsed.data;
  }
  /** A cached body read the same way; null when it no longer fits (the read then goes to STRATZ). */
  function parseRows<T>(body: string, pick: (data: unknown) => unknown, schema: z.ZodType<T>): T[] | null {
    try {
      const parsed = z
        .array(schema)
        .max(5000)
        .safeParse(pick((JSON.parse(body) as { data?: unknown }).data));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
  const heroStats = (data: unknown, field: string) =>
    (data as { heroStats?: Record<string, unknown> } | undefined)?.heroStats?.[field];
  const heroId = (value: number) => Math.trunc(value);
  const place = (position: number) => {
    const each = Math.trunc(position);
    if (each < 1 || each > 5) throw new StratzError('STRATZ_SHAPE');
    return each;
  };
  /** The arguments every per-hero aggregate takes: the hero, Divine and Immortal, one position. */
  const scope = (id: number, position: number) =>
    `heroId: ${heroId(id)}, bracketBasicIds: [DIVINE_IMMORTAL], positionIds: [POSITION_${place(position)}]`;
  return {
    async heroWeeks(bracket, weeks, signal) {
      const name = bracket === null ? Object.values(BRACKETS).join(', ') : BRACKETS[bracket];
      if (name === undefined) throw new StratzError('STRATZ_SHAPE');
      const rows = await query(
        `{ heroStats { winWeek(take: ${Math.min(Math.max(Math.trunc(weeks), 1), 4)}, bracketIds: [${name}]) { heroId week matchCount winCount } } }`,
        (data) => heroStats(data, 'winWeek'),
        winRowSchema,
        signal
      );
      return rows
        .map((row) => ({ heroId: row.heroId, week: row.week, matches: row.matchCount, wins: row.winCount }))
        .sort((a, b) => b.week - a.week);
    },
    async positionWeeks(bracket, position, weeks, signal) {
      const name = bracket === null ? Object.values(BRACKETS).join(', ') : BRACKETS[bracket];
      if (name === undefined) throw new StratzError('STRATZ_SHAPE');
      const rows = await query(
        `{ heroStats { winWeek(take: ${Math.min(Math.max(Math.trunc(weeks), 1), 4)}, bracketIds: [${name}], positionIds: [POSITION_${place(position)}]) { heroId week matchCount winCount } } }`,
        (data) => heroStats(data, 'winWeek'),
        winRowSchema,
        signal
      );
      return rows
        .map((row) => ({ heroId: row.heroId, week: row.week, matches: row.matchCount, wins: row.winCount }))
        .sort((a, b) => b.week - a.week);
    },
    async lengthRates(position, signal) {
      // One role at a time: every role with every minute came back over the 1 MB cap (DEV, 28.10.2026).
      const rows = await query(
        `{ heroStats { stats(groupByPosition: true, groupByTime: true, bracketBasicIds: [DIVINE_IMMORTAL], positionIds: [POSITION_${place(position)}]) { heroId position time matchCount winCount } } }`,
        (data) => heroStats(data, 'stats'),
        lengthSchema,
        signal
      );
      return rows
        .map((row) => ({ row, place: positionPlace(row.position) }))
        .filter((each) => each.place >= 1 && each.place <= 5)
        .map((each) => ({
          heroId: each.row.heroId,
          position: each.place,
          minute: each.row.time,
          matches: each.row.matchCount,
          wins: each.row.winCount
        }));
    },
    async heroPurchases(id, signal) {
      const rows = await query(
        `{ heroStats { itemFullPurchase(heroId: ${heroId(id)}) { itemId time matchCount winCount } } }`,
        (data) => heroStats(data, 'itemFullPurchase'),
        purchaseSchema,
        signal
      );
      return rows.map((row) => ({ itemId: row.itemId, minute: row.time, matches: row.matchCount, wins: row.winCount }));
    },
    async heroPositionDays(id, position, days, signal) {
      const rows = await query(
        `{ heroStats { winDay(take: ${Math.min(Math.max(Math.trunc(days), 1), 14)}, heroIds: [${heroId(id)}], positionIds: [POSITION_${place(position)}], bracketIds: [DIVINE, IMMORTAL]) { day matchCount winCount } } }`,
        (data) => heroStats(data, 'winDay'),
        dayRowSchema,
        signal
      );
      return rows.map((row) => ({ day: row.day, matches: row.matchCount, wins: row.winCount }));
    },
    async positions(signal) {
      const rows = await query(
        '{ heroStats { stats(groupByPosition: true, bracketBasicIds: [DIVINE_IMMORTAL]) { heroId position matchCount winCount } } }',
        (data) => heroStats(data, 'stats'),
        positionSchema,
        signal
      );
      return rows
        .map((row) => ({
          heroId: row.heroId,
          position: Number(/POSITION_(\d)/u.exec(row.position)?.[1] ?? 0),
          matches: row.matchCount,
          wins: row.winCount
        }))
        .filter((row) => row.position >= 1 && row.position <= 5);
    },
    async startingItems(id, position, signal) {
      const rows = await query(
        `{ heroStats { itemStartingPurchase(${scope(id, position)}) { itemId instance matchCount winCount } } }`,
        (data) => heroStats(data, 'itemStartingPurchase'),
        startSchema,
        signal
      );
      return rows.map((row) => ({
        itemId: row.itemId,
        instance: row.instance,
        matches: row.matchCount,
        wins: row.winCount
      }));
    },
    async positionPurchases(id, position, signal) {
      const rows = await query(
        `{ heroStats { itemFullPurchase(${scope(id, position)}) { itemId time matchCount winCount } } }`,
        (data) => heroStats(data, 'itemFullPurchase'),
        purchaseSchema,
        signal
      );
      return rows.map((row) => ({ itemId: row.itemId, minute: row.time, matches: row.matchCount, wins: row.winCount }));
    },
    async neutralItems(id, position, signal) {
      const rows = await query(
        `{ heroStats { itemNeutral(${scope(id, position)}) { itemId matchCount winCount item { stat { neutralItemTier } } } } }`,
        (data) => heroStats(data, 'itemNeutral'),
        neutralSchema,
        signal
      );
      return rows.map((row) => ({
        itemId: row.itemId,
        tier: Number(/TIER_(\d)/u.exec(row.item?.stat?.neutralItemTier ?? '')?.[1] ?? 0) || null,
        matches: row.matchCount,
        wins: row.winCount
      }));
    },
    async talents(id, position, signal) {
      const rows = await query(
        `{ heroStats { talent(${scope(id, position)}) { abilityId matchCount winCount } } }`,
        (data) => heroStats(data, 'talent'),
        talentSchema,
        signal
      );
      return rows.map((row) => ({ abilityId: row.abilityId, matches: row.matchCount, wins: row.winCount }));
    },
    async matchups(id, signal) {
      const rows = await query(
        `{ heroStats { heroVsHeroMatchup(heroId: ${heroId(id)}, take: ${MATCHUP_TAKE}) { advantage { vs { heroId2 matchCount winCount } } } } }`,
        (data) => (heroStats(data, 'heroVsHeroMatchup') as { advantage?: unknown } | undefined)?.advantage,
        matchupSchema,
        signal
      );
      return rows
        .flatMap((row) => row.vs)
        .map((row) => ({ heroId: row.heroId2, matches: row.matchCount, wins: row.winCount }));
    },
    async guideSample(id, position, withPurchases, signal) {
      const wanted = place(position);
      const hero = heroId(id);
      const field = (alias: string, filter: string) =>
        `${alias}: guide(heroId: ${hero}, positionId: POSITION_${wanted}, take: 10${filter}) { guides { matchId steamAccountId match { startDateTime gameVersionId } } }`;
      const fields = [
        field('base', ''),
        field('pro', ', isPro: true'),
        ...GUIDE_OPPONENTS.filter((other) => other !== hero).map((other) =>
          field(`v${other}`, `, againstHeroId: ${other}`)
        )
      ];
      const lists: z.infer<typeof candidateSchema>[] = [];
      for (const [index, part] of chunked(fields, QUERY_MAX_CHARS).entries()) {
        if (index > 0) await new Promise((resolve) => setTimeout(resolve, STRATZ_GAP_MS));
        lists.push(
          ...(await query(
            `{ heroStats { ${part.join(' ')} } }`,
            (data) => [(data as { heroStats?: unknown } | undefined)?.heroStats],
            candidateSchema,
            signal
          ))
        );
      }
      const unique = new Map<string, { matchId: number; steamAccountId: number; patch: number | null; at: number }>();
      for (const list of lists)
        for (const each of Object.values(list))
          for (const guide of each.flatMap((one) => one.guides))
            unique.set(`${guide.matchId}:${guide.steamAccountId}`, {
              matchId: guide.matchId,
              steamAccountId: guide.steamAccountId,
              patch: guide.match?.gameVersionId ?? null,
              at: guide.match?.startDateTime ?? 0
            });
      const candidates = [...unique.values()];
      const newest = Math.max(-1, ...candidates.map((each) => each.patch ?? -1));
      const onNewest = candidates.filter((each) => each.patch === newest);
      const chosen = (onNewest.length >= GUIDE_MIN_NEWEST ? onNewest : candidates)
        .sort((a, b) => b.at - a.at)
        .slice(0, GUIDE_TARGET);
      const purchases = withPurchases
        ? ' stats { itemPurchases { time itemId } inventoryReport { neutral0 { itemId } } }'
        : ' stats { inventoryReport { neutral0 { itemId } } }';
      const readOf = (each: { matchId: number; steamAccountId: number }, slotNumber: number) =>
        `m${slotNumber}: match(id: ${each.matchId}) { gameVersionId durationSeconds players(steamAccountId: ${each.steamAccountId}) { heroId isVictory position item0Id item1Id item2Id item3Id item4Id item5Id neutral0Id abilities { abilityId time level }${purchases} } }`;
      const matches: StratzGuideMatch[] = [];
      const seen: Record<string, number> = {};
      // One request at a time with a pause (STRATZ blocked eight at once): up to ten matches a request, fewer when the
      // text would pass the bridge's limit.
      for (let from = 0; from < chosen.length;) {
        await new Promise((resolve) => setTimeout(resolve, STRATZ_GAP_MS));
        const reads: string[] = [];
        const batch: typeof chosen = [];
        let size = 4;
        while (batch.length < DETAIL_BATCH && from + batch.length < chosen.length) {
          const next = chosen[from + batch.length];
          if (next === undefined) break;
          const read = readOf(next, batch.length);
          if (batch.length > 0 && size + read.length + 1 > QUERY_MAX_CHARS) break;
          size += read.length + 1;
          reads.push(read);
          batch.push(next);
        }
        from += batch.length;
        const details = await query(`{ ${reads.join(' ')} }`, (data) => [data], detailSchema, signal);
        const byAlias = details[0] ?? {};
        batch.forEach((each, index) => {
          const match = byAlias[`m${index}`];
          const player = match?.players[0];
          if (match == null || player === undefined || player.isVictory === null) return;
          seen[player.position ?? 'нет'] = (seen[player.position ?? 'нет'] ?? 0) + 1;
          if (player.position !== `POSITION_${wanted}` || player.heroId !== hero) return;
          const events = player.stats?.itemPurchases;
          matches.push({
            victory: player.isVictory,
            startedAt: each.at === 0 ? null : each.at,
            patch: match.gameVersionId ?? each.patch,
            minutes: match.durationSeconds === null ? null : match.durationSeconds / 60,
            items: [
              player.item0Id,
              player.item1Id,
              player.item2Id,
              player.item3Id,
              player.item4Id,
              player.item5Id
            ].filter((item): item is number => item !== null),
            neutral: player.neutral0Id,
            neutralsHeld: [
              ...new Set(
                (player.stats?.inventoryReport ?? []).flatMap((minute) =>
                  minute.neutral0 === null ? [] : [minute.neutral0.itemId]
                )
              )
            ],
            purchases:
              events == null ? null : events.map((event) => ({ itemId: event.itemId, minute: event.time / 60 })),
            abilities: player.abilities ?? []
          });
        });
      }
      const patch = Math.max(-1, ...matches.map((each) => each.patch ?? -1));
      const current = matches.filter((each) => each.patch === patch);
      return {
        fetched: chosen.length,
        total: candidates.length,
        matches: current.length >= GUIDE_MIN_NEWEST ? current : matches,
        positions: seen
      };
    }
  };
}
