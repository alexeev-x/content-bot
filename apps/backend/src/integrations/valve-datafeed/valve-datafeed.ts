import { z } from 'zod';
import { causeDetail, readErrorDetail } from '../../platform/error-detail';
import { readCappedText } from '../../platform/http/read-capped-text';

// Valve's own dota2.com datafeed in Russian (no key; the studio already reads it for patches): heroes with their
// abilities and numbers, items with costs and recipes, patch notes. Sizes measured 25.10.2026: herolist 3 KB,
// herodata 5 KB a hero, itemlist 13 KB, itemdata 3 KB an item, a patch's notes up to 200 KB.

export const DATAFEED_TIMEOUT_MS = 15_000;
const API = 'https://www.dota2.com/datafeed';
const MAX_BODY_BYTES = 600_000;

export type DatafeedErrorCode = 'DATAFEED_FETCH' | 'DATAFEED_HTTP' | 'DATAFEED_SHAPE';

export class DatafeedError extends Error {
  constructor(
    readonly code: DatafeedErrorCode,
    readonly httpStatus: number | null = null,
    /** The provider's own error text, bounded and redacted (`platform/error-detail.ts`). */
    readonly detail?: string
  ) {
    super(code);
    this.name = 'DatafeedError';
  }
}

export interface DatafeedHeroSummary {
  id: number;
  name: string;
  nameLoc: string;
  /** 0 strength, 1 agility, 2 intelligence, 3 universal. */
  primaryAttr: number;
}

export interface DatafeedAbility {
  id: number;
  name: string;
  nameLoc: string;
  descLoc: string;
  scepterLoc: string;
  shardLoc: string;
  /** 1 is an ultimate. */
  type: number;
  cooldowns: number[];
  manaCosts: number[];
  castRanges: number[];
  /** `bonuses`: what each talent (by its key) adds to this value. */
  values: { name: string; heading: string; values: number[]; bonuses: { talent: string; value: number }[] }[];
}

export interface DatafeedHero extends DatafeedHeroSummary {
  /** 1 melee, 2 ranged. */
  attackCapability: number;
  attackRange: number;
  attackRate: number;
  movementSpeed: number;
  turnRate: number;
  armor: number;
  maxHealth: number;
  damageMin: number;
  damageMax: number;
  sightDay: number;
  sightNight: number;
  abilities: DatafeedAbility[];
  /** The eight talents, level 10 pair first, then 15, 20, 25. */
  talents: DatafeedAbility[];
}

export interface DatafeedItemSummary {
  id: number;
  name: string;
  nameLoc: string;
  neutralTier: number;
  /** For `item_recipe_…`: the component item ids of each way to build it. */
  recipes: number[][];
}

export interface DatafeedPatchNotes {
  version: string;
  timestamp: number;
  heroes: { heroId: number; notes: { abilityId: number | null; note: string }[] }[];
  items: { itemId: number; notes: string[] }[];
}

const text = z.string().max(20_000).catch('');
const numbers = z.array(z.number()).max(40).catch([]);
const heroListSchema = z.object({
  result: z.object({
    data: z.object({
      heroes: z
        .array(
          z.object({
            id: z.number().int(),
            name: z.string().max(80),
            name_loc: z.string().max(80),
            primary_attr: z.number()
          })
        )
        .max(300)
    })
  })
});
const abilitySchema = z.object({
  id: z.number().int(),
  name: z.string().max(100),
  name_loc: z.string().max(200).catch(''),
  desc_loc: text,
  scepter_loc: text,
  shard_loc: text,
  type: z.number().int().catch(0),
  cooldowns: numbers,
  mana_costs: numbers,
  cast_ranges: numbers,
  special_values: z
    .array(
      z.object({
        name: z.string().max(100).catch(''),
        heading_loc: z.string().max(200).catch(''),
        values_float: numbers,
        bonuses: z
          .array(z.object({ name: z.string().max(100), value: z.number().catch(0) }))
          .max(20)
          .catch([])
      })
    )
    .max(60)
    .catch([])
});
const heroDataSchema = z.object({
  result: z.object({
    data: z.object({
      heroes: z
        .array(
          z.object({
            id: z.number().int(),
            name: z.string().max(80),
            name_loc: z.string().max(80),
            primary_attr: z.number(),
            attack_capability: z.number(),
            attack_range: z.number(),
            attack_rate: z.number(),
            movement_speed: z.number(),
            turn_rate: z.number(),
            armor: z.number(),
            max_health: z.number(),
            damage_min: z.number(),
            damage_max: z.number(),
            sight_range_day: z.number(),
            sight_range_night: z.number(),
            abilities: z.array(abilitySchema).max(30),
            talents: z.array(abilitySchema).max(12).catch([])
          })
        )
        .min(1)
        .max(1)
    })
  })
});
const toAbility = (ability: z.infer<typeof abilitySchema>): DatafeedAbility => ({
  id: ability.id,
  name: ability.name,
  nameLoc: ability.name_loc,
  descLoc: ability.desc_loc,
  scepterLoc: ability.scepter_loc,
  shardLoc: ability.shard_loc,
  type: ability.type,
  cooldowns: ability.cooldowns,
  manaCosts: ability.mana_costs,
  castRanges: ability.cast_ranges,
  values: ability.special_values.map((each) => ({
    name: each.name,
    heading: each.heading_loc,
    values: each.values_float,
    bonuses: each.bonuses.map((bonus) => ({ talent: bonus.name, value: bonus.value }))
  }))
});
const itemListSchema = z.object({
  result: z.object({
    data: z.object({
      itemabilities: z
        .array(
          z.object({
            id: z.number().int(),
            name: z.string().max(100),
            name_loc: z.string().max(200).catch(''),
            neutral_item_tier: z.number().int().catch(-1),
            recipes: z
              .array(z.object({ items: z.array(z.number().int()).max(10) }))
              .max(5)
              .catch([])
          })
        )
        .max(2000)
    })
  })
});
const itemDataSchema = z.object({
  result: z.object({
    data: z.object({
      items: z
        .array(
          z.object({
            id: z.number().int(),
            item_cost: z.number().int().catch(0),
            special_values: z
              .array(z.object({ name: z.string().max(100).catch(''), values_float: numbers }))
              .max(60)
              .catch([])
          })
        )
        .min(1)
        .max(1)
    })
  })
});
const patchListSchema = z.object({
  patches: z.array(z.object({ patch_number: z.string().max(20), patch_timestamp: z.number().int() })).max(500)
});
const noteSchema = z.object({ note: z.string().max(4_000) });
const patchNotesSchema = z.object({
  patch_number: z.string().max(20),
  patch_timestamp: z.number().int(),
  heroes: z
    .array(
      z.object({
        hero_id: z.number().int(),
        hero_notes: z.array(noteSchema).max(200).optional(),
        abilities: z
          .array(z.object({ ability_id: z.number().int(), ability_notes: z.array(noteSchema).max(200).optional() }))
          .max(40)
          .optional()
      })
    )
    .max(300)
    .catch([]),
  items: z
    .array(z.object({ ability_id: z.number().int(), ability_notes: z.array(noteSchema).max(200).optional() }))
    .max(500)
    .catch([])
});

export interface ValveDatafeedApi {
  heroList(signal?: AbortSignal): Promise<DatafeedHeroSummary[]>;
  hero(heroId: number, signal?: AbortSignal): Promise<DatafeedHero>;
  itemList(signal?: AbortSignal): Promise<DatafeedItemSummary[]>;
  itemCost(itemId: number, signal?: AbortSignal): Promise<number>;
  /** The item's own numbers by Valve's value name (`blink_damage_cooldown`). */
  itemValues(itemId: number, signal?: AbortSignal): Promise<{ name: string; values: number[] }[]>;
  patchList(signal?: AbortSignal): Promise<{ version: string; timestamp: number }[]>;
  patchNotes(version: string, signal?: AbortSignal): Promise<DatafeedPatchNotes>;
}

export function createValveDatafeedApi(input: { fetchImpl?: typeof fetch } = {}): ValveDatafeedApi {
  const fetchImpl = input.fetchImpl ?? fetch;
  async function get<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${API}${path}`, {
        headers: { Accept: 'application/json' },
        signal: signal ?? AbortSignal.timeout(DATAFEED_TIMEOUT_MS),
        redirect: 'manual'
      });
    } catch (error) {
      throw new DatafeedError('DATAFEED_FETCH', null, causeDetail(error));
    }
    if (!response.ok) throw new DatafeedError('DATAFEED_HTTP', response.status, await readErrorDetail(response));
    const body = await readCappedText(response, MAX_BODY_BYTES);
    if (body === null) throw new DatafeedError('DATAFEED_SHAPE');
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new DatafeedError('DATAFEED_SHAPE');
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new DatafeedError('DATAFEED_SHAPE');
    return parsed.data;
  }
  return {
    async heroList(signal) {
      const body = await get('/herolist?language=russian', heroListSchema, signal);
      return body.result.data.heroes.map((hero) => ({
        id: hero.id,
        name: hero.name,
        nameLoc: hero.name_loc,
        primaryAttr: hero.primary_attr
      }));
    },
    async hero(heroId, signal) {
      const body = await get(`/herodata?language=russian&hero_id=${Math.trunc(heroId)}`, heroDataSchema, signal);
      const hero = body.result.data.heroes[0];
      if (hero === undefined) throw new DatafeedError('DATAFEED_SHAPE');
      return {
        id: hero.id,
        name: hero.name,
        nameLoc: hero.name_loc,
        primaryAttr: hero.primary_attr,
        attackCapability: hero.attack_capability,
        attackRange: hero.attack_range,
        attackRate: hero.attack_rate,
        movementSpeed: hero.movement_speed,
        turnRate: hero.turn_rate,
        armor: hero.armor,
        maxHealth: hero.max_health,
        damageMin: hero.damage_min,
        damageMax: hero.damage_max,
        sightDay: hero.sight_range_day,
        sightNight: hero.sight_range_night,
        abilities: hero.abilities.map(toAbility),
        talents: hero.talents.map(toAbility)
      };
    },
    async itemList(signal) {
      const body = await get('/itemlist?language=russian', itemListSchema, signal);
      return body.result.data.itemabilities.map((item) => ({
        id: item.id,
        name: item.name,
        nameLoc: item.name_loc,
        neutralTier: item.neutral_item_tier,
        recipes: item.recipes.map((recipe) => recipe.items)
      }));
    },
    async itemCost(itemId, signal) {
      const body = await get(`/itemdata?language=russian&item_id=${Math.trunc(itemId)}`, itemDataSchema, signal);
      return body.result.data.items[0]?.item_cost ?? 0;
    },
    async itemValues(itemId, signal) {
      const body = await get(`/itemdata?language=russian&item_id=${Math.trunc(itemId)}`, itemDataSchema, signal);
      return (body.result.data.items[0]?.special_values ?? []).map((each) => ({
        name: each.name,
        values: each.values_float
      }));
    },
    async patchList(signal) {
      const body = await get('/patchnoteslist?language=russian', patchListSchema, signal);
      return body.patches.map((patch) => ({ version: patch.patch_number, timestamp: patch.patch_timestamp }));
    },
    async patchNotes(version, signal) {
      if (!/^[0-9a-z.]{1,20}$/.test(version)) throw new DatafeedError('DATAFEED_SHAPE');
      const body = await get(`/patchnotes?version=${version}&language=russian`, patchNotesSchema, signal);
      return {
        version: body.patch_number,
        timestamp: body.patch_timestamp,
        heroes: body.heroes.map((hero) => ({
          heroId: hero.hero_id,
          notes: [
            ...(hero.hero_notes ?? []).map((each) => ({ abilityId: null, note: each.note })),
            ...(hero.abilities ?? []).flatMap((ability) =>
              (ability.ability_notes ?? []).map((each) => ({ abilityId: ability.ability_id, note: each.note }))
            )
          ]
        })),
        items: body.items.map((item) => ({
          itemId: item.ability_id,
          notes: (item.ability_notes ?? []).map((each) => each.note)
        }))
      };
    }
  };
}
