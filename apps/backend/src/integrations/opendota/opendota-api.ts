import { z } from 'zod';
import { readCappedText } from '../../platform/http/read-capped-text';

// OpenDota's public API without a key (about 60 calls a minute and 2 000–3 000 a day from one IP). Read-only. Sizes
// measured 25.10.2026: heroStats 33 KB, items 61 KB, abilities 245 KB, hero_abilities 35 KB, a record list 1 KB.

export const OPENDOTA_TIMEOUT_MS = 15_000;
const API = 'https://api.opendota.com/api';
const MAX_BODY_BYTES = 600_000;

export type OpenDotaErrorCode = 'OPENDOTA_FETCH' | 'OPENDOTA_RATE' | 'OPENDOTA_HTTP' | 'OPENDOTA_SHAPE';

export class OpenDotaApiError extends Error {
  constructor(
    readonly code: OpenDotaErrorCode,
    readonly httpStatus: number | null = null
  ) {
    super(code);
    this.name = 'OpenDotaApiError';
  }
}

/** Picks and wins per rank bracket: 1 Рекрут … 8 Титан (OpenDota leaves 8 empty). */
export type BracketCounts = Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, { picks: number; wins: number }>;

export interface OpenDotaHero {
  id: number;
  /** `npc_dota_hero_…`; its tail names the Valve image. */
  name: string;
  localizedName: string;
  primaryAttr: string;
  attackType: string;
  roles: string[];
  attackRange: number;
  moveSpeed: number;
  legs: number;
  baseAttackTime: number;
  brackets: BracketCounts;
}

export interface OpenDotaItem {
  id: number;
  key: string;
  name: string;
  cost: number | null;
}

export interface OpenDotaRecord {
  matchId: number;
  heroId: number | null;
  score: number;
  startTime: number;
}

export interface OpenDotaItemTiming {
  heroId: number;
  /** Bought by this many seconds of game time. */
  time: number;
  games: number;
  wins: number;
}

export interface OpenDotaAbility {
  key: string;
  name: string;
  /** Per level, as OpenDota gives them («120 100 80» becomes three entries). */
  cooldown: string[];
  manaCost: string[];
  attributes: { header: string; value: string[] }[];
}

const count = z.coerce.number().int().nonnegative();
const heroStatsSchema = z
  .array(
    z.object({
      id: z.number().int().positive(),
      name: z.string().min(1).max(80),
      localized_name: z.string().min(1).max(80),
      primary_attr: z.string().max(10),
      attack_type: z.string().max(20),
      roles: z.array(z.string().max(40)).max(20),
      attack_range: z.number(),
      move_speed: z.number(),
      legs: z.number().int().nonnegative(),
      base_attack_time: z.number(),
      '1_pick': count.nullish(),
      '1_win': count.nullish(),
      '2_pick': count.nullish(),
      '2_win': count.nullish(),
      '3_pick': count.nullish(),
      '3_win': count.nullish(),
      '4_pick': count.nullish(),
      '4_win': count.nullish(),
      '5_pick': count.nullish(),
      '5_win': count.nullish(),
      '6_pick': count.nullish(),
      '6_win': count.nullish(),
      '7_pick': count.nullish(),
      '7_win': count.nullish(),
      '8_pick': count.nullish(),
      '8_win': count.nullish()
    })
  )
  .min(1)
  .max(300);
const itemsSchema = z.record(
  z.string().max(100),
  z.object({ id: z.number().int().nonnegative(), dname: z.string().max(100).optional(), cost: z.number().nullish() })
);
const popularitySchema = z.object({
  start_game_items: z.record(z.string(), count).optional(),
  early_game_items: z.record(z.string(), count).optional(),
  mid_game_items: z.record(z.string(), count).optional(),
  late_game_items: z.record(z.string(), count).optional()
});
const recordsSchema = z
  .array(
    z.object({
      match_id: z.number().int().positive(),
      hero_id: z.number().int().positive().nullable(),
      score: z.coerce.number(),
      start_time: z.number().int().nonnegative()
    })
  )
  .max(500);
const timingsSchema = z
  .array(z.object({ hero_id: z.number().int(), time: z.number().int(), games: count, wins: count }))
  .max(5000);
const perLevel = z
  .union([z.string(), z.array(z.string())])
  .transform((value) =>
    (Array.isArray(value) ? value : value.split(/\s+/)).map((each) => each.trim()).filter((each) => each !== '')
  );
const abilitySchema = z.object({
  dname: z.string().min(1).max(100),
  cd: perLevel.optional(),
  mc: perLevel.optional(),
  attrib: z
    .array(z.object({ header: z.string().max(100).optional(), value: perLevel.optional() }))
    .max(40)
    .optional()
});
const heroAbilitiesSchema = z.record(
  z.string().max(80),
  // Monkey King lists a pair of alternate abilities as one nested entry; only plain slots count.
  z.object({ abilities: z.array(z.union([z.string().max(100), z.array(z.string().max(100)).max(5)])).max(30) })
);

export type OpenDotaRecordField = 'duration' | 'kills' | 'gold_per_min';
export type OpenDotaPopularity = Record<'start' | 'early' | 'mid' | 'late', Map<number, number>>;

export interface OpenDotaApi {
  heroStats(signal?: AbortSignal): Promise<OpenDotaHero[]>;
  items(signal?: AbortSignal): Promise<Map<number, OpenDotaItem>>;
  heroItemPopularity(heroId: number, signal?: AbortSignal): Promise<OpenDotaPopularity>;
  records(field: OpenDotaRecordField, signal?: AbortSignal): Promise<OpenDotaRecord[]>;
  itemTimings(itemKey: string, signal?: AbortSignal): Promise<OpenDotaItemTiming[]>;
  /** Each hero's ability keys in slot order, keyed by `npc_dota_hero_…`. */
  heroAbilities(signal?: AbortSignal): Promise<Map<string, string[]>>;
  /** Only the named abilities: the whole list is 245 KB, and checking every entry would cost the request's CPU. */
  abilities(keys: readonly string[], signal?: AbortSignal): Promise<Map<string, OpenDotaAbility>>;
}

export function createOpenDotaApi(input: { fetchImpl?: typeof fetch } = {}): OpenDotaApi {
  const fetchImpl = input.fetchImpl ?? fetch;
  async function get(path: string, signal?: AbortSignal): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${API}${path}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'alexeev-content-bot' },
        signal: signal ?? AbortSignal.timeout(OPENDOTA_TIMEOUT_MS)
      });
    } catch {
      throw new OpenDotaApiError('OPENDOTA_FETCH');
    }
    if (response.status === 429) throw new OpenDotaApiError('OPENDOTA_RATE', 429);
    if (!response.ok) throw new OpenDotaApiError('OPENDOTA_HTTP', response.status);
    const text = await readCappedText(response, MAX_BODY_BYTES);
    if (text === null) throw new OpenDotaApiError('OPENDOTA_SHAPE');
    try {
      return JSON.parse(text);
    } catch {
      throw new OpenDotaApiError('OPENDOTA_SHAPE');
    }
  }
  function parse<T>(schema: z.ZodType<T>, body: unknown): T {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new OpenDotaApiError('OPENDOTA_SHAPE');
    return parsed.data;
  }
  const toMap = (counts: Record<string, number> | undefined) =>
    new Map(Object.entries(counts ?? {}).map(([id, total]) => [Number(id), total]));
  return {
    async heroStats(signal) {
      return parse(heroStatsSchema, await get('/heroStats', signal)).map((hero) => {
        const brackets = {} as BracketCounts;
        for (const bracket of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
          brackets[bracket] = { picks: hero[`${bracket}_pick`] ?? 0, wins: hero[`${bracket}_win`] ?? 0 };
        }
        return {
          id: hero.id,
          name: hero.name,
          localizedName: hero.localized_name,
          primaryAttr: hero.primary_attr,
          attackType: hero.attack_type,
          roles: hero.roles,
          attackRange: hero.attack_range,
          moveSpeed: hero.move_speed,
          legs: hero.legs,
          baseAttackTime: hero.base_attack_time,
          brackets
        };
      });
    },
    async items(signal) {
      const items = parse(itemsSchema, await get('/constants/items', signal));
      const byId = new Map<number, OpenDotaItem>();
      for (const [key, item] of Object.entries(items)) {
        byId.set(item.id, { id: item.id, key, name: item.dname ?? key, cost: item.cost ?? null });
      }
      return byId;
    },
    async heroItemPopularity(heroId, signal) {
      const body = parse(popularitySchema, await get(`/heroes/${Math.trunc(heroId)}/itemPopularity`, signal));
      return {
        start: toMap(body.start_game_items),
        early: toMap(body.early_game_items),
        mid: toMap(body.mid_game_items),
        late: toMap(body.late_game_items)
      };
    },
    async records(field, signal) {
      return parse(recordsSchema, await get(`/records/${field}`, signal)).map((record) => ({
        matchId: record.match_id,
        heroId: record.hero_id,
        score: record.score,
        startTime: record.start_time
      }));
    },
    async itemTimings(itemKey, signal) {
      if (!/^[a-z0-9_]{1,60}$/.test(itemKey)) throw new OpenDotaApiError('OPENDOTA_SHAPE');
      return parse(timingsSchema, await get(`/scenarios/itemTimings?item=${itemKey}`, signal)).map((row) => ({
        heroId: row.hero_id,
        time: row.time,
        games: row.games,
        wins: row.wins
      }));
    },
    async heroAbilities(signal) {
      const body = parse(heroAbilitiesSchema, await get('/constants/hero_abilities', signal));
      return new Map(
        Object.entries(body).map(([hero, entry]) => [
          hero,
          entry.abilities.filter((key): key is string => typeof key === 'string')
        ])
      );
    },
    async abilities(keys, signal) {
      const body = await get('/constants/abilities', signal);
      if (typeof body !== 'object' || body === null) throw new OpenDotaApiError('OPENDOTA_SHAPE');
      const found = new Map<string, OpenDotaAbility>();
      for (const key of keys) {
        const parsed = abilitySchema.safeParse((body as Record<string, unknown>)[key]);
        if (!parsed.success) continue;
        found.set(key, {
          key,
          name: parsed.data.dname,
          cooldown: parsed.data.cd ?? [],
          manaCost: parsed.data.mc ?? [],
          attributes: (parsed.data.attrib ?? []).map((each) => ({ header: each.header ?? '', value: each.value ?? [] }))
        });
      }
      return found;
    }
  };
}
