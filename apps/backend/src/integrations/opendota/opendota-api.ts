import { z } from 'zod';
import { readCappedText } from '../../platform/http/read-capped-text';

// OpenDota public API (https://docs.opendota.com, checked 16.10.2026): free, no key, 60 requests a minute.
// The owner's rank, Dota Plus, wins and most played heroes; matches and heroes are visible only when
// «Expose Public Match Data» is on in Dota. Four GETs per read.
const API = 'https://api.opendota.com/api';
export const OPENDOTA_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 600_000;
const TOP_HEROES = 5;

export class OpenDotaError extends Error {
  constructor(readonly code: 'DOTA_UNREACHABLE' | 'DOTA_SHAPE' | 'DOTA_NOT_FOUND') {
    super(code);
    this.name = 'OpenDotaError';
  }
}

export interface DotaPlayerSnapshot {
  rankTier: number | null;
  plus: boolean;
  publicMatchData: boolean;
  wins: number;
  losses: number;
  topHeroes: { id: number; name: string; games: number; winRate: number }[];
}

const playerSchema = z.object({
  profile: z.object({ plus: z.boolean().nullable().optional() }).nullable().optional(),
  rank_tier: z.number().int().nullable().optional()
});
const wlSchema = z.object({ win: z.number().int().nonnegative(), lose: z.number().int().nonnegative() });
const heroesSchema = z.array(
  z.object({ hero_id: z.coerce.number().int(), games: z.number().int(), win: z.number().int() })
);
const heroNamesSchema = z.array(z.object({ id: z.number().int(), localized_name: z.string() }));

async function get<T>(fetchImpl: typeof fetch, path: string, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(`${API}${path}`, { headers: { accept: 'application/json' }, signal });
  } catch {
    throw new OpenDotaError('DOTA_UNREACHABLE');
  }
  if (response.status === 404) throw new OpenDotaError('DOTA_NOT_FOUND');
  if (!response.ok) {
    await response.body?.cancel();
    throw new OpenDotaError('DOTA_UNREACHABLE');
  }
  const text = await readCappedText(response, MAX_BODY_BYTES);
  if (text === null) throw new OpenDotaError('DOTA_SHAPE');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new OpenDotaError('DOTA_SHAPE');
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new OpenDotaError('DOTA_SHAPE');
  return parsed.data;
}

/** One read of the owner's public Dota profile. */
export async function readDotaPlayer(
  fetchImpl: typeof fetch,
  accountId: string,
  signal: AbortSignal
): Promise<DotaPlayerSnapshot> {
  const id = encodeURIComponent(accountId);
  const [player, wl, heroes] = await Promise.all([
    get(fetchImpl, `/players/${id}`, playerSchema, signal),
    get(fetchImpl, `/players/${id}/wl`, wlSchema, signal),
    get(fetchImpl, `/players/${id}/heroes`, heroesSchema, signal)
  ]);
  const played = heroes
    .filter((hero) => hero.games > 0)
    .sort((a, b) => b.games - a.games)
    .slice(0, TOP_HEROES);
  // Hero names only when there is something to name: the list is the biggest response.
  const names =
    played.length === 0
      ? new Map<number, string>()
      : new Map(
          (await get(fetchImpl, '/heroes', heroNamesSchema, signal)).map((hero) => [hero.id, hero.localized_name])
        );
  return {
    rankTier: player.rank_tier ?? null,
    plus: player.profile?.plus ?? false,
    publicMatchData: wl.win + wl.lose > 0,
    wins: wl.win,
    losses: wl.lose,
    topHeroes: played.map((hero) => ({
      id: hero.hero_id,
      name: names.get(hero.hero_id) ?? `#${hero.hero_id}`,
      games: hero.games,
      winRate: hero.games === 0 ? 0 : Math.round((hero.win / hero.games) * 100) / 100
    }))
  };
}
