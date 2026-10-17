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
import { CDN_HOSTS, cdnUrl, type HeroAssetStorage, KIND_SPEC, objectKey } from './types';

const HERO_LIST_URL = 'https://www.dota2.com/datafeed/herolist?language=english';
const HERO_LIST_MAX_BYTES = 512 * 1024;
/** The biggest render today is a few MB; anything far above is not what we expect. */
const ASSET_MAX_BYTES = 40 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;
/** A claimed file not finished within this is claimable again (the Worker was cut off). */
const LEASE_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** One file costs up to two CDN fetches (a mirror after a refusal), an R2 write and one D1 update. */
const ASSET_COST = 4;
/** About 16 subrequests of the 50 a Free-plan invocation allows; the budget check lowers it when less is left. */
export const HERO_ASSETS_PER_TICK = 5;

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

/**
 * The runtime's own words for a failed call («Too many subrequests.», «Network connection lost.», a timeout),
 * cut to fit the stored code. The CDN URL is public, so nothing secret can be in it.
 */
function reason(error: unknown): string {
  if (!(error instanceof Error)) return '';
  const text = `${error.name === 'Error' ? '' : `${error.name} `}${error.message}`
    .replace(/[^\w .:-]/g, '')
    .trim()
    .slice(0, 56);
  return text === '' ? '' : `: ${text}`;
}

function backoff(attempts: number): number {
  return Math.min(24 * HOUR_MS, 10 * 60 * 1000 * 2 ** Math.max(0, attempts - 1));
}

/**
 * The owner's «Проверить у Valve» (owner decision 15.10.2026: Cron never asks Valve on its own): reads the hero
 * list, adds new heroes and queues again the files Valve did not have before. One fetch, two statements.
 */
export async function refreshHeroList(deps: {
  repo: HeroAssetRepository;
  fetchImpl: typeof fetch;
  clock: Clock;
}): Promise<{ listed: number }> {
  const heroes = await fetchHeroList(deps.fetchImpl).catch((error: unknown) => {
    throw new AppError('UNAVAILABLE', `The Dota hero list is unavailable${reason(error)}`);
  });
  await deps.repo.upsertHeroes(heroes, deps.clock.now());
  await deps.repo.requeueUnfinished(deps.clock.now());
  return { listed: heroes.length };
}

/**
 * One Cron step: copies up to HERO_ASSETS_PER_TICK queued or failed files from Valve's CDN into R2. With
 * nothing queued it is one indexed read and never contacts Valve. Each file is one fetch, one R2 write and one
 * update; the subrequest budget decides how many fit.
 */
export async function mirrorHeroAssets(deps: {
  repo: HeroAssetRepository;
  storage: HeroAssetStorage;
  fetchImpl: typeof fetch;
  clock: Clock;
  budget: { charge(count: number): void; remaining(): number };
  reserve: number;
  logger: Logger;
}): Promise<{ stored: number; missing: number; failed: number }> {
  const summary = { stored: 0, missing: 0, failed: 0 };
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
  // Each mirror in turn until one answers 200 or 404; what every mirror said is kept for the gallery.
  const said: string[] = [];
  let response: Response | null = null;
  for (const host of CDN_HOSTS) {
    deps.budget.charge(1);
    try {
      // Called as a plain function: the runtime's fetch throws «Illegal invocation» when called as `deps.fetchImpl()`.
      const fetchImpl = deps.fetchImpl;
      const answer = await fetchImpl(cdnUrl(host.base, slug, kind), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (answer.ok || answer.status === 404) {
        response = answer;
        break;
      }
      await answer.body?.cancel();
      said.push(`${host.label} HTTP_${answer.status}`);
    } catch (error) {
      said.push(`${host.label} FETCH${reason(error)}`);
    }
  }
  if (response === null) return fail(said.join(' / ').slice(0, 80));
  // Only «not found» means Valve has no such file; a refusal (403) is retried like any other failure.
  if (response.status === 404) {
    await response.body?.cancel();
    await deps.repo.finish({
      slug,
      kind,
      now: deps.clock.now(),
      status: 'missing',
      // Not claimed again: «Проверить у Valve» queues it once more.
      nextAttemptAt: deps.clock.now(),
      errorCode: `HTTP_${response.status}`
    });
    return 'missing';
  }
  if (!response.ok || response.body === null) {
    await response.body?.cancel();
    return fail(`HTTP_${response.status}`);
  }
  // Read whole (a few MB at most): the CDN may answer a Worker compressed and without Content-Length, so the
  // size is measured, not trusted. A declared size over the limit is refused before reading.
  if (Number(response.headers.get('content-length') ?? '0') > ASSET_MAX_BYTES) {
    await response.body.cancel();
    return fail('HERO_ASSET_SIZE');
  }
  let bytes: ArrayBuffer;
  try {
    bytes = await response.arrayBuffer();
  } catch (error) {
    return fail(`HERO_ASSET_READ${reason(error)}`);
  }
  const size = bytes.byteLength;
  if (size === 0 || size > ASSET_MAX_BYTES) return fail('HERO_ASSET_SIZE');
  try {
    deps.budget.charge(1);
    await deps.storage.put(objectKey(slug, kind), bytes, spec.contentType);
  } catch (error) {
    return fail(`HERO_ASSET_STORE${error instanceof Error && error.name !== 'Error' ? `_${error.name}` : ''}`);
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
    hero.assets.push({ kind: row.kind, status: row.status, size: row.size, errorCode: row.errorCode });
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
