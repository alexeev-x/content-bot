import {
  type DotaHeroAssetsDto,
  type DotaHeroDto,
  HERO_ASSET_KINDS,
  type HeroAssetKind,
  heroSlugSchema
} from '@alexeev/contracts';
import { z } from 'zod';
import type { Clock } from '../../platform/clock';
import type { Logger } from '../../platform/logging/logger';
import { AppError } from '../../shared/app-error';
import type { HeroAssetRepository, HeroRow } from './d1-hero-assets-repository';
import { cdnUrl, type HeroAssetStorage, KIND_SPEC, objectKey } from './types';

const HERO_LIST_URL = 'https://www.dota2.com/datafeed/herolist?language=english';
const HERO_LIST_MAX_BYTES = 512 * 1024;
/** The biggest render today is a few MB; anything far above is not what we expect. */
const ASSET_MAX_BYTES = 40 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;
/** A claimed file not finished within this is claimable again (the Worker was cut off). */
const LEASE_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** Valve has no such file: looked at again weekly (a new hero's render often comes later). */
const MISSING_RECHECK_MS = 7 * 24 * HOUR_MS;
/** One file costs a CDN fetch, an R2 write and one D1 update. */
const ASSET_COST = 3;
/** About 25 statements of the 50 a Free-plan invocation allows; the budget check lowers it when less is left. */
export const HERO_ASSETS_PER_TICK = 8;

const heroListSchema = z.object({
  result: z.object({
    data: z.object({
      heroes: z
        .array(
          z.object({
            id: z.number().int().nonnegative(),
            name: z.string(),
            name_english_loc: z.string().min(1).max(100)
          })
        )
        .max(300)
    })
  })
});

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new Error('HERO_LIST_TOO_LARGE');
  const text = await response.text();
  if (text.length > maxBytes) throw new Error('HERO_LIST_TOO_LARGE');
  return text;
}

async function fetchHeroList(fetchImpl: typeof fetch): Promise<HeroRow[]> {
  const response = await fetchImpl(HERO_LIST_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HERO_LIST_HTTP_${response.status}`);
  const parsed = heroListSchema.safeParse(JSON.parse(await readLimited(response, HERO_LIST_MAX_BYTES)));
  if (!parsed.success) throw new Error('HERO_LIST_SHAPE');
  return parsed.data.result.data.heroes.flatMap((hero) => {
    const slug = heroSlugSchema.safeParse(hero.name.replace(/^npc_dota_hero_/, ''));
    return slug.success ? [{ slug: slug.data, id: hero.id, name: hero.name_english_loc }] : [];
  });
}

function backoff(attempts: number): number {
  return Math.min(24 * HOUR_MS, 10 * 60 * 1000 * 2 ** Math.max(0, attempts - 1));
}

/**
 * One Cron step: refreshes the hero list when asked (or when nothing is listed yet), then copies up to
 * HERO_ASSETS_PER_TICK due files from Valve's CDN into R2. Each file is one claim, one fetch, one streamed R2
 * write and one update; the subrequest budget decides how many fit.
 */
export async function mirrorHeroAssets(deps: {
  repo: HeroAssetRepository;
  storage: HeroAssetStorage;
  fetchImpl: typeof fetch;
  clock: Clock;
  budget: { charge(count: number): void; remaining(): number };
  reserve: number;
  refreshList: boolean;
  logger: Logger;
}): Promise<{ listed: number; stored: number; missing: number; failed: number }> {
  const summary = { listed: 0, stored: 0, missing: 0, failed: 0 };
  if (deps.refreshList || (await deps.repo.count()) === 0) {
    deps.budget.charge(1);
    const heroes = await fetchHeroList(deps.fetchImpl);
    await deps.repo.upsertHeroes(heroes, deps.clock.now());
    summary.listed = heroes.length;
  }
  const fits = Math.floor((deps.budget.remaining() - deps.reserve - 1) / ASSET_COST);
  const claimed = await deps.repo.claimDue(deps.clock.now(), Math.min(HERO_ASSETS_PER_TICK, fits), LEASE_MS);
  for (const { slug, kind, attempts } of claimed) {
    const outcome = await copyAsset(deps, slug, kind, attempts);
    summary[outcome] += 1;
  }
  return summary;
}

async function copyAsset(
  deps: Parameters<typeof mirrorHeroAssets>[0],
  slug: string,
  kind: HeroAssetKind,
  attempts: number
): Promise<'stored' | 'missing' | 'failed'> {
  const spec = KIND_SPEC[kind];
  const fail = async (errorCode: string) => {
    await deps.repo.finish({
      slug,
      kind,
      now: deps.clock.now(),
      status: 'failed',
      nextAttemptAt: deps.clock.now() + backoff(attempts),
      errorCode
    });
    deps.logger.warn({ component: 'hero-assets', operation: 'copy', status: 'error', errorCode });
    return 'failed' as const;
  };
  deps.budget.charge(1);
  let response: Response;
  try {
    response = await deps.fetchImpl(cdnUrl(slug, kind), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    return fail('HERO_ASSET_FETCH');
  }
  if (response.status === 404 || response.status === 403) {
    await response.body?.cancel();
    await deps.repo.finish({
      slug,
      kind,
      now: deps.clock.now(),
      status: 'missing',
      nextAttemptAt: deps.clock.now() + MISSING_RECHECK_MS,
      errorCode: `HTTP_${response.status}`
    });
    return 'missing';
  }
  if (!response.ok || response.body === null) {
    await response.body?.cancel();
    return fail(`HTTP_${response.status}`);
  }
  const size = Number(response.headers.get('content-length') ?? 'NaN');
  if (!Number.isInteger(size) || size <= 0 || size > ASSET_MAX_BYTES) {
    await response.body.cancel();
    return fail('HERO_ASSET_SIZE');
  }
  try {
    deps.budget.charge(1);
    await deps.storage.put(objectKey(slug, kind), response.body, size, spec.contentType);
  } catch {
    return fail('HERO_ASSET_STORE');
  }
  await deps.repo.finish({
    slug,
    kind,
    now: deps.clock.now(),
    status: 'stored',
    nextAttemptAt: deps.clock.now(),
    size,
    contentType: spec.contentType
  });
  return 'stored';
}

/** Every hero with each file's state, by hero name. */
export async function listHeroAssets(repo: HeroAssetRepository): Promise<DotaHeroAssetsDto> {
  const rows = await repo.list();
  const heroes = new Map<string, DotaHeroDto>();
  for (const row of rows) {
    const hero = heroes.get(row.slug) ?? { slug: row.slug, id: row.heroId, name: row.heroName, assets: [] };
    hero.assets.push({ kind: row.kind, status: row.status, size: row.size });
    heroes.set(row.slug, hero);
  }
  for (const hero of heroes.values())
    hero.assets.sort((a, b) => HERO_ASSET_KINDS.indexOf(a.kind) - HERO_ASSET_KINDS.indexOf(b.kind));
  const count = (status: string) => rows.filter((row) => row.status === status).length;
  return {
    total: rows.length,
    stored: count('stored'),
    missing: count('missing'),
    failed: count('failed'),
    heroes: [...heroes.values()]
  };
}

/** A stored file's bytes from R2. */
export async function readHeroAsset(
  deps: { repo: HeroAssetRepository; storage: HeroAssetStorage },
  slug: string,
  kind: HeroAssetKind
): Promise<{ body: ReadableStream<Uint8Array>; size: number; contentType: string }> {
  if ((await deps.repo.status(slug, kind)) !== 'stored') throw new AppError('NOT_FOUND', 'Hero file is not stored');
  const object = await deps.storage.get(objectKey(slug, kind));
  if (object === null) throw new AppError('NOT_FOUND', 'Hero file is not stored');
  return { ...object, contentType: KIND_SPEC[kind].contentType };
}
