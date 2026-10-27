import { z } from 'zod';
import { readCappedText } from '../../platform/http/read-capped-text';

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
    readonly httpStatus: number | null = null
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
/** Matches per guide sample (STRATZ's `take`). */
/** STRATZ's guide list answers ten matches a page (DEV, 27.10.2026: «из 10» for take 100): pages of ten, up to 100. */
const GUIDE_PAGE = 10;
const GUIDE_PAGES = 10;
const GUIDE_TAKE = GUIDE_PAGE * GUIDE_PAGES;
const GUIDE_PAGE_GAP_MS = 1200;
const slot = z.number().int().nullable().catch(null);
const guideSchema = z.object({
  matchCount: count,
  guides: z
    .array(
      z.object({
        match: z
          .object({
            startDateTime: z.number().nullable().catch(null),
            gameVersionId: z.number().int().nullable().catch(null)
          })
          .nullable()
          .catch(null),
        matchPlayer: z
          .object({
            isVictory: z.boolean().nullable().catch(null),
            position: z.string().max(20).nullable().catch(null),
            item0Id: slot,
            item1Id: slot,
            item2Id: slot,
            item3Id: slot,
            item4Id: slot,
            item5Id: slot,
            neutral0Id: slot.optional(),
            abilities: z
              .array(
                z.object({
                  abilityId: z.number().int(),
                  time: z.number().catch(0),
                  level: z.number().catch(0)
                })
              )
              .max(60)
              .catch([]),
            stats: z
              .object({
                itemPurchases: z
                  .array(z.object({ time: z.number(), itemId: z.number().int() }))
                  .max(500)
                  .nullable()
                  .catch(null)
              })
              .nullable()
              .catch(null)
          })
          .nullable()
          .catch(null)
      })
    )
    .max(GUIDE_TAKE)
});
const timeSchema = z.object({ time: z.number().int(), remainingMatchCount: count, winCount: count });
const positionSchema = z.object({
  heroId: z.number().int(),
  position: z.string().max(20),
  matchCount: count,
  winCount: count
});
const averageSchema = z.object({
  heroId: z.number().int(),
  matchCount: count,
  networth: z.coerce.number().catch(0),
  heroDamage: z.coerce.number().catch(0),
  kills: z.coerce.number().catch(0),
  deaths: z.coerce.number().catch(0)
});

/** One player's match as a guide sample row; `purchases` is null when the reply carried none. */
export interface StratzGuideMatch {
  victory: boolean;
  startedAt: number | null;
  patch: number | null;
  items: number[];
  /** The neutral item slot at the end of the match. */
  neutral: number | null;
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
  /** A hero's matches still going at each minute and the wins among them (Divine and Immortal). */
  heroTimeline(heroId: number, signal?: AbortSignal): Promise<{ minute: number; remaining: number; wins: number }[]>;
  /** Every hero's matches and wins by position 1–5 (Divine and Immortal). */
  positions(signal?: AbortSignal): Promise<{ heroId: number; position: number; matches: number; wins: number }[]>;
  /** Every hero's per-match averages this week (Divine and Immortal); STRATZ leaves goldPerMinute empty. */
  averages(
    signal?: AbortSignal
  ): Promise<
    { heroId: number; matches: number; networth: number; heroDamage: number; kills: number; deaths: number }[]
  >;
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
   * A hero's recent matches at one position (HeroGuideListType): per match the player's outcome, final inventory,
   * abilities and, with `withPurchases`, every item purchase. Only the rows the player's own position confirms are kept.
   */
  guideSample(
    heroId: number,
    position: number,
    withPurchases: boolean,
    signal?: AbortSignal
  ): Promise<{ fetched: number; total: number; matches: StratzGuideMatch[]; positions: Record<string, number> }>;
}

/** Matches per guide sample and opponents per matchup read: both bound the reply. */
const MATCHUP_TAKE = 130;

/** `bridgeUrl`: the stats bridge's origin; without it STRATZ is called directly (it works from any non-Cloudflare host). */
export function createStratzApi(input: { token: string; bridgeUrl?: string; fetchImpl?: typeof fetch }): StratzApi {
  const endpoint = input.bridgeUrl === undefined ? DIRECT : `${input.bridgeUrl.replace(/\/+$/, '')}/stratz/graphql`;
  const fetchImpl = input.fetchImpl ?? fetch;
  async function query<T>(
    text: string,
    pick: (data: unknown) => unknown,
    schema: z.ZodType<T>,
    signal?: AbortSignal
  ): Promise<T[]> {
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
    } catch {
      throw new StratzError('STRATZ_FETCH');
    }
    if (response.status === 401 || response.status === 403) {
      // STRATZ's gateway (Kong) names itself when it refuses a key; a refusal without that header is not about the key.
      const byGateway = (response.headers.get('www-authenticate') ?? '').toLowerCase().includes('kong');
      await response.body?.cancel();
      throw new StratzError(byGateway ? 'STRATZ_TOKEN' : 'STRATZ_BLOCKED', response.status);
    }
    if (response.status === 429) throw new StratzError('STRATZ_RATE', 429);
    if (!response.ok) throw new StratzError('STRATZ_HTTP', response.status);
    const body = await readCappedText(response, MAX_BODY_BYTES);
    if (body === null) throw new StratzError('STRATZ_SHAPE');
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new StratzError('STRATZ_SHAPE');
    }
    const rows = pick((json as { data?: unknown }).data);
    const parsed = z.array(schema).max(5000).safeParse(rows);
    if (!parsed.success) throw new StratzError('STRATZ_SHAPE');
    return parsed.data;
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
    async heroPurchases(id, signal) {
      const rows = await query(
        `{ heroStats { itemFullPurchase(heroId: ${heroId(id)}) { itemId time matchCount winCount } } }`,
        (data) => heroStats(data, 'itemFullPurchase'),
        purchaseSchema,
        signal
      );
      return rows.map((row) => ({ itemId: row.itemId, minute: row.time, matches: row.matchCount, wins: row.winCount }));
    },
    async heroTimeline(id, signal) {
      const rows = await query(
        `{ heroStats { stats(heroIds: [${heroId(id)}], groupByTime: true, bracketBasicIds: [DIVINE_IMMORTAL], minTime: 0, maxTime: 75) { time remainingMatchCount winCount } } }`,
        (data) => heroStats(data, 'stats'),
        timeSchema,
        signal
      );
      return rows.map((row) => ({ minute: row.time, remaining: row.remainingMatchCount, wins: row.winCount }));
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
    async averages(signal) {
      const rows = await query(
        '{ heroStats { stats(bracketBasicIds: [DIVINE_IMMORTAL]) { heroId matchCount networth heroDamage kills deaths } } }',
        (data) => heroStats(data, 'stats'),
        averageSchema,
        signal
      );
      return rows.map((row) => ({
        heroId: row.heroId,
        matches: row.matchCount,
        networth: row.networth,
        heroDamage: row.heroDamage,
        kills: row.kills,
        deaths: row.deaths
      }));
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
        tier: Number(/TIER_(d)/u.exec(row.item?.stat?.neutralItemTier ?? '')?.[1] ?? 0) || null,
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
      const purchases = withPurchases ? ' stats { itemPurchases { time itemId } }' : '';
      // Page by page, one after another with a pause: rubrics are not in a hurry (owner, 27.10.2026).
      const lists: z.infer<typeof guideSchema>[] = [];
      for (let page = 0; page < GUIDE_PAGES; page += 1) {
        if (page > 0) await new Promise((resolve) => setTimeout(resolve, GUIDE_PAGE_GAP_MS));
        const rows = await query(
          `{ heroStats { guide(heroId: ${heroId(id)}, positionId: POSITION_${wanted}, take: ${GUIDE_PAGE}, skip: ${page * GUIDE_PAGE}) { matchCount guides { match { startDateTime gameVersionId } matchPlayer { isVictory position item0Id item1Id item2Id item3Id item4Id item5Id neutral0Id abilities { abilityId time level }${purchases} } } } } }`,
          (data) => heroStats(data, 'guide'),
          guideSchema,
          signal
        );
        lists.push(...rows);
        if (rows.flatMap((list) => list.guides).length < GUIDE_PAGE) break;
      }
      const matches: StratzGuideMatch[] = [];
      let fetched = 0;
      // The positions the rows came with, for the owner's note when none matched.
      const seen: Record<string, number> = {};
      for (const guide of lists.flatMap((list) => list.guides)) {
        fetched += 1;
        const player = guide.matchPlayer;
        if (player === null || player.isVictory === null) continue;
        seen[player.position ?? 'нет'] = (seen[player.position ?? 'нет'] ?? 0) + 1;
        if (Number(/POSITION_(d)/u.exec(player.position ?? '')?.[1] ?? 0) !== wanted) continue;
        const events = player.stats?.itemPurchases;
        matches.push({
          victory: player.isVictory,
          startedAt: guide.match?.startDateTime ?? null,
          patch: guide.match?.gameVersionId ?? null,
          items: [
            player.item0Id,
            player.item1Id,
            player.item2Id,
            player.item3Id,
            player.item4Id,
            player.item5Id
          ].filter((each): each is number => each !== null),
          neutral: player.neutral0Id ?? null,
          purchases: events == null ? null : events.map((event) => ({ itemId: event.itemId, minute: event.time / 60 })),
          abilities: player.abilities
        });
      }
      return { fetched, total: lists.reduce((sum, list) => sum + list.matchCount, 0), matches, positions: seen };
    }
  };
}
