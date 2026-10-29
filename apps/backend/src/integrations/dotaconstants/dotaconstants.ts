import { z } from 'zod';
import { causeDetail, readErrorDetail } from '../../platform/error-detail';
import { readCappedText } from '../../platform/http/read-capped-text';

// OpenDota's dotaconstants on GitHub: every hero's base numbers and every item's cost and recipe, rebuilt after each
// patch (last 12.10.2026 when checked 25.10.2026). Served by GitHub, so the Worker is not rate-limited the way it is on
// OpenDota's own API, which answers 429 to Cloudflare's shared addresses. heroes.json is 123 KB, items.json 474 KB.

export const DOTACONSTANTS_TIMEOUT_MS = 15_000;
const BASE = 'https://raw.githubusercontent.com/odota/dotaconstants/master/build';
// The same constant OpenDota serves, from dotaconstants on GitHub: OpenDota refuses Cloudflare's addresses (DEV,
// 27.10.2026: DOTACONSTANTS_HTTP).
const HERO_ABILITIES_URL = 'https://raw.githubusercontent.com/odota/dotaconstants/master/build/hero_abilities.json';
const MAX_BODY_BYTES = 800_000;

export type DotaConstantsErrorCode = 'DOTACONSTANTS_FETCH' | 'DOTACONSTANTS_HTTP' | 'DOTACONSTANTS_SHAPE';

export class DotaConstantsError extends Error {
  constructor(
    readonly code: DotaConstantsErrorCode,
    readonly httpStatus: number | null = null,
    /** The provider's own error text, bounded and redacted (`platform/error-detail.ts`). */
    readonly detail?: string
  ) {
    super(code);
    this.name = 'DotaConstantsError';
  }
}

export interface ConstantsHero {
  id: number;
  name: string;
  localizedName: string;
  primaryAttr: 'str' | 'agi' | 'int' | 'all';
  attackType: 'Melee' | 'Ranged';
  roles: string[];
  moveSpeed: number;
  attackRange: number;
  baseAttackTime: number;
  baseArmor: number;
  baseHealth: number;
  turnRate: number | null;
  legs: number;
  dayVision: number;
  nightVision: number;
  projectileSpeed: number;
}

export interface ConstantsItem {
  id: number;
  key: string;
  name: string;
  cost: number;
  components: string[];
  /** 1–5 for a neutral item, else null. */
  neutralTier: number | null;
}

const heroSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().max(80),
  localized_name: z.string().max(80),
  primary_attr: z.enum(['str', 'agi', 'int', 'all']),
  attack_type: z.enum(['Melee', 'Ranged']),
  roles: z.array(z.string().max(40)).max(20).catch([]),
  move_speed: z.number(),
  attack_range: z.number(),
  // «attack_rate» is the base attack time in seconds (1.7); «base_attack_time» is the attack speed (100).
  attack_rate: z.number(),
  base_armor: z.number(),
  base_health: z.number().catch(0),
  turn_rate: z.number().nullable().catch(null),
  legs: z.number().int().catch(2),
  day_vision: z.number().catch(0),
  night_vision: z.number().catch(0),
  projectile_speed: z.number().catch(0)
});

const talentLevelsSchema = z.object({
  // Rubick and Ringmaster carry extra talents at tiers 5–7 (DEV, 27.10.2026: DOTACONSTANTS_SHAPE); only 1–4 are the tree.
  talents: z.array(z.object({ name: z.string().max(100), level: z.number().int().min(1).max(10) })).max(24)
});

export interface DotaConstantsApi {
  heroes(signal?: AbortSignal): Promise<ConstantsHero[]>;
  items(signal?: AbortSignal): Promise<ConstantsItem[]>;
  /** A hero's talents with the tier the game puts them at: 1–4 for levels 10, 15, 20, 25, two to a tier. */
  talentLevels(heroName: string, signal?: AbortSignal): Promise<{ name: string; level: number }[]>;
}

export function createDotaConstantsApi(input: { fetchImpl?: typeof fetch } = {}): DotaConstantsApi {
  const fetchImpl = input.fetchImpl ?? fetch;
  async function getUrl(url: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        signal: signal ?? AbortSignal.timeout(DOTACONSTANTS_TIMEOUT_MS)
      });
    } catch (error) {
      throw new DotaConstantsError('DOTACONSTANTS_FETCH', null, causeDetail(error));
    }
    if (!response.ok)
      throw new DotaConstantsError('DOTACONSTANTS_HTTP', response.status, await readErrorDetail(response));
    const text = await readCappedText(response, MAX_BODY_BYTES);
    if (text === null) throw new DotaConstantsError('DOTACONSTANTS_SHAPE');
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new DotaConstantsError('DOTACONSTANTS_SHAPE');
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body))
      throw new DotaConstantsError('DOTACONSTANTS_SHAPE');
    return body as Record<string, unknown>;
  }
  const get = (file: string, signal?: AbortSignal) => getUrl(`${BASE}/${file}`, signal);
  return {
    async heroes(signal) {
      const heroes: ConstantsHero[] = [];
      // Entry by entry: one odd hero is skipped instead of failing the list.
      for (const entry of Object.values(await get('heroes.json', signal))) {
        const parsed = heroSchema.safeParse(entry);
        if (!parsed.success) continue;
        const hero = parsed.data;
        heroes.push({
          id: hero.id,
          name: hero.name,
          localizedName: hero.localized_name,
          primaryAttr: hero.primary_attr,
          attackType: hero.attack_type,
          roles: hero.roles,
          moveSpeed: hero.move_speed,
          attackRange: hero.attack_range,
          baseAttackTime: hero.attack_rate,
          baseArmor: hero.base_armor,
          baseHealth: hero.base_health,
          turnRate: hero.turn_rate,
          legs: hero.legs,
          dayVision: hero.day_vision,
          nightVision: hero.night_vision,
          projectileSpeed: hero.projectile_speed
        });
      }
      if (heroes.length < 100) throw new DotaConstantsError('DOTACONSTANTS_SHAPE');
      return heroes;
    },
    async items(signal) {
      const items: ConstantsItem[] = [];
      for (const [key, entry] of Object.entries(await get('items.json', signal))) {
        if (key.startsWith('recipe_')) continue;
        // Checked by hand, not with Zod: some 500 entries, and the request has 10 ms of CPU.
        if (typeof entry !== 'object' || entry === null) continue;
        const { id, dname, cost, components, tier } = entry as Record<string, unknown>;
        if (typeof id !== 'number' || typeof dname !== 'string' || typeof cost !== 'number') continue;
        items.push({
          id,
          key,
          name: dname.slice(0, 100),
          cost,
          components: Array.isArray(components)
            ? components.filter((part): part is string => typeof part === 'string').slice(0, 10)
            : [],
          neutralTier: typeof tier === 'number' && tier >= 1 && tier <= 5 ? tier : null
        });
      }
      if (items.length < 100) throw new DotaConstantsError('DOTACONSTANTS_SHAPE');
      return items;
    },
    async talentLevels(heroName, signal) {
      // OpenDota's own constants (170 KB for every hero): the GitHub copy's talent order is not a documented pairing.
      const all = await getUrl(HERO_ABILITIES_URL, signal);
      const parsed = talentLevelsSchema.safeParse(all[heroName]);
      if (!parsed.success) throw new DotaConstantsError('DOTACONSTANTS_SHAPE');
      return parsed.data.talents.filter((talent) => talent.level <= 4);
    }
  };
}
