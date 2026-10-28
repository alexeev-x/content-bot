import { z } from 'zod';
import { readCappedText } from '../../platform/http/read-capped-text';
import { causeDetail, readErrorDetail, schemaDetail } from '../../platform/error-detail';

// OpenDota's public hero reads (no key; 50 a minute and 2800 a day through the owner's stats bridge). OpenDota answers
// 429 to Cloudflare's shared addresses, so the Worker only calls it through `bridge/stats-bridge`, which forwards
// `GET /opendota/heroes/{id}/(matchups|itemPopularity|durations)` and `/publicMatches`. It is the «Гайд на героя»
// fallback behind STRATZ and lists the high-rank matches the guide's own base collects.

export const OPENDOTA_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 1_000_000;
const MAX_ROWS = 400;
const MAX_ITEMS = 600;

export type OpenDotaErrorCode = 'OPENDOTA_FETCH' | 'OPENDOTA_HTTP' | 'OPENDOTA_RATE' | 'OPENDOTA_SHAPE';

export class OpenDotaError extends Error {
  constructor(
    readonly code: OpenDotaErrorCode,
    readonly httpStatus: number | null = null,
    /** The provider's own error text, bounded and redacted (`platform/error-detail.ts`). */
    readonly detail?: string
  ) {
    super(code);
    this.name = 'OpenDotaError';
  }
}

const count = z.coerce.number().nonnegative().catch(0);
/** Item id (as a string key) → how many matches bought it. */
const itemCounts = z.record(z.string(), count).catch({});
const popularitySchema = z.object({
  start_game_items: itemCounts,
  early_game_items: itemCounts,
  mid_game_items: itemCounts,
  late_game_items: itemCounts
});
const matchupSchema = z.array(z.object({ hero_id: z.number().int(), games_played: count, wins: count })).max(MAX_ROWS);
const durationSchema = z
  .array(z.object({ duration_bin: z.coerce.number().nonnegative(), games_played: count, wins: count }))
  .max(MAX_ROWS);

/** `min_rank`: OpenDota's rank tier floor (75 is Divine 5, 80 Immortal); a page holds 100 matches, newest first. */
const PUBLIC_MIN_RANK = 75;
const publicMatchSchema = z
  .array(
    z.object({
      match_id: z.number().int().positive(),
      start_time: z.number().int().nonnegative(),
      avg_rank_tier: z.number().int().nullable().catch(null)
    })
  )
  .max(MAX_ROWS);

export type ItemCounts = Record<string, number>;

export interface OpenDotaApi {
  /** What the hero's players bought in each stretch of the match: item id → matches. */
  heroItemPopularity(
    heroId: number,
    signal?: AbortSignal
  ): Promise<{
    start_game_items: ItemCounts;
    early_game_items: ItemCounts;
    mid_game_items: ItemCounts;
    late_game_items: ItemCounts;
  }>;
  /** The hero's matches and wins against each other hero. */
  heroMatchups(
    heroId: number,
    signal?: AbortSignal
  ): Promise<{ hero_id: number; games_played: number; wins: number }[]>;
  /** The hero's matches and wins by match length: `duration_bin` is the bin's start in seconds. */
  heroDurations(
    heroId: number,
    signal?: AbortSignal
  ): Promise<{ duration_bin: number; games_played: number; wins: number }[]>;
  /** The newest high-rank (Divine 5 and up) public matches OpenDota has seen, newest first; `start_time` in seconds. */
  publicMatches(
    signal?: AbortSignal
  ): Promise<{ match_id: number; start_time: number; avg_rank_tier: number | null }[]>;
}

/** `bridgeUrl`: the stats bridge's origin. */
export function createOpenDotaApi(input: { bridgeUrl: string; fetchImpl?: typeof fetch }): OpenDotaApi {
  const base = `${input.bridgeUrl.replace(/\/+$/, '')}/opendota`;
  const fetchImpl = input.fetchImpl ?? fetch;
  async function read<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: signal ?? AbortSignal.timeout(OPENDOTA_TIMEOUT_MS)
      });
    } catch (error) {
      throw new OpenDotaError('OPENDOTA_FETCH', null, causeDetail(error));
    }
    if (response.status === 429) {
      throw new OpenDotaError('OPENDOTA_RATE', 429, await readErrorDetail(response));
    }
    if (!response.ok) {
      throw new OpenDotaError('OPENDOTA_HTTP', response.status, await readErrorDetail(response));
    }
    const body = await readCappedText(response, MAX_BODY_BYTES);
    if (body === null) throw new OpenDotaError('OPENDOTA_SHAPE', null, `ответ больше ${MAX_BODY_BYTES} байт`);
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new OpenDotaError('OPENDOTA_SHAPE', null, 'ответ не JSON');
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new OpenDotaError('OPENDOTA_SHAPE', null, schemaDetail(parsed.error));
    return parsed.data;
  }
  const hero = (id: number) => {
    const each = Math.trunc(id);
    if (!Number.isInteger(each) || each < 1 || each > 999) throw new OpenDotaError('OPENDOTA_SHAPE');
    return each;
  };
  const capped = (counts: ItemCounts): ItemCounts => {
    if (Object.keys(counts).length > MAX_ITEMS) throw new OpenDotaError('OPENDOTA_SHAPE');
    return counts;
  };
  return {
    async heroItemPopularity(id, signal) {
      const rows = await read(`/heroes/${hero(id)}/itemPopularity`, popularitySchema, signal);
      return {
        start_game_items: capped(rows.start_game_items),
        early_game_items: capped(rows.early_game_items),
        mid_game_items: capped(rows.mid_game_items),
        late_game_items: capped(rows.late_game_items)
      };
    },
    heroMatchups: (id, signal) => read(`/heroes/${hero(id)}/matchups`, matchupSchema, signal),
    heroDurations: (id, signal) => read(`/heroes/${hero(id)}/durations`, durationSchema, signal),
    publicMatches: (signal) => read(`/publicMatches?min_rank=${PUBLIC_MIN_RANK}`, publicMatchSchema, signal)
  };
}
