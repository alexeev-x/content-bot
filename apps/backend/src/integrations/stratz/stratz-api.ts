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

export interface StratzApi {
  /** Every hero's matches and wins in a bracket for the last `weeks` weeks (newest first per hero). */
  heroWeeks(
    bracket: number,
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
}

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
  return {
    async heroWeeks(bracket, weeks, signal) {
      const name = BRACKETS[bracket];
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
    }
  };
}
