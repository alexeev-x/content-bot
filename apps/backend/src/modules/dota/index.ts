import { z } from 'zod';

export const DOTA_SOURCE_KEYS = ['steam_news', 'patch_notes'] as const;
export type DotaSourceKey = (typeof DOTA_SOURCE_KEYS)[number];

const steamNewsItemSchema = z
  .object({
    gid: z.string().min(1).max(100),
    title: z.string().trim().min(1).max(500),
    url: z.string().url().max(2048),
    date: z.number().int().nonnegative(),
    feedname: z.string().min(1).max(100),
    is_external_url: z.boolean().optional(),
    author: z.string().max(500).optional(),
    contents: z.string().max(10_000).optional(),
    feedlabel: z.string().max(200).optional(),
    feed_type: z.number().int().optional(),
    tags: z.array(z.string().max(100)).max(100).nullable().optional(),
    appid: z.number().int().optional()
  })
  .strict();

const steamNewsSchema = z
  .object({
    appnews: z
      .object({
        appid: z.literal(570),
        count: z.number().int().nonnegative(),
        newsitems: z.array(steamNewsItemSchema).max(100)
      })
      .strict()
  })
  .strict();

const patchSchema = z
  .object({
    patch_number: z.string().trim().min(1).max(40),
    patch_name: z.string().trim().min(1).max(120),
    patch_timestamp: z.number().int().nonnegative(),
    patch_website: z.string().max(120).optional(),
    patch_website_anchor: z.string().max(120).optional()
  })
  .strict();

const patchListSchema = z
  .object({
    success: z.literal(true),
    patches: z.array(patchSchema).max(200)
  })
  .strict();

const STEAM_NEWS_URL =
  'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=100&maxlength=500&feeds=steam_community_announcements';
const PATCH_LIST_URL = 'https://www.dota2.com/datafeed/patchnoteslist';
const MAX_STEAM_BYTES = 512 * 1024;
const MAX_PATCH_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 8_000;
const INSERT_CHUNK_SIZE = 16;

export class DotaWatchError extends Error {
  constructor(
    readonly code:
      'DOTA_SOURCE_FETCH' | 'DOTA_SOURCE_HTTP' | 'DOTA_SOURCE_BODY_LIMIT' | 'DOTA_SOURCE_JSON' | 'DOTA_SOURCE_SHAPE',
    readonly sourceKey: DotaSourceKey
  ) {
    super(`${code}_${sourceKey}`);
    this.name = 'DotaWatchError';
  }
}

export interface DotaSourceFetcher {
  fetch(source: DotaSourceKey): Promise<Response>;
}

export function createOfficialDotaFetcher(fetchImpl: typeof fetch = fetch): DotaSourceFetcher {
  return {
    async fetch(source) {
      const url = source === 'steam_news' ? STEAM_NEWS_URL : PATCH_LIST_URL;
      return fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'error'
      });
    }
  };
}

export interface DotaUpdateItem {
  sourceKey: DotaSourceKey;
  externalId: string;
  title: string;
  sourceUrl: string;
  publishedAt: number;
}

export interface DotaWatcherRepository {
  storeSync(input: { items: DotaUpdateItem[]; detectedAt: number }): Promise<{ inserted: number }>;
}

async function readBoundedJson(response: Response, maximumBytes: number, sourceKey: DotaSourceKey): Promise<unknown> {
  if (!response.ok) throw new DotaWatchError('DOTA_SOURCE_HTTP', sourceKey);
  if (response.body === null) throw new DotaWatchError('DOTA_SOURCE_JSON', sourceKey);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new DotaWatchError('DOTA_SOURCE_BODY_LIMIT', sourceKey);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new DotaWatchError('DOTA_SOURCE_JSON', sourceKey);
  }
}

function parseSteamNews(payload: unknown): DotaUpdateItem[] {
  const parsed = steamNewsSchema.safeParse(payload);
  if (!parsed.success) throw new DotaWatchError('DOTA_SOURCE_SHAPE', 'steam_news');
  const official: DotaUpdateItem[] = [];
  for (const news of parsed.data.appnews.newsitems) {
    if (news.feedname !== 'steam_community_announcements') continue;
    const url = new URL(news.url);
    const allowedHost = url.hostname === 'store.steampowered.com' || url.hostname === 'steamstore-a.akamaihd.net';
    const officialPath =
      url.pathname === `/news/app/570/view/${news.gid}` ||
      url.pathname === `/news/externalpost/steam_community_announcements/${news.gid}`;
    if (!['http:', 'https:'].includes(url.protocol) || !allowedHost || !officialPath) {
      throw new DotaWatchError('DOTA_SOURCE_SHAPE', 'steam_news');
    }
    official.push({
      sourceKey: 'steam_news',
      externalId: news.gid,
      title: news.title,
      sourceUrl: `https://store.steampowered.com/news/externalpost/steam_community_announcements/${encodeURIComponent(news.gid)}`,
      publishedAt: news.date * 1_000
    });
  }
  return official;
}

function parsePatchList(payload: unknown): DotaUpdateItem[] {
  const parsed = patchListSchema.safeParse(payload);
  if (!parsed.success) throw new DotaWatchError('DOTA_SOURCE_SHAPE', 'patch_notes');
  return parsed.data.patches.map((patch) => ({
    sourceKey: 'patch_notes',
    externalId: patch.patch_number,
    title: `Dota ${patch.patch_name}`,
    sourceUrl: `https://www.dota2.com/patches/${encodeURIComponent(patch.patch_number)}`,
    publishedAt: patch.patch_timestamp * 1_000
  }));
}

export async function syncDotaUpdates(input: {
  fetcher: DotaSourceFetcher;
  repo: DotaWatcherRepository;
  detectedAt: number;
}): Promise<{ inserted: number; fetched: number }> {
  const fetchSource = async (sourceKey: DotaSourceKey): Promise<Response> => {
    try {
      return await input.fetcher.fetch(sourceKey);
    } catch {
      throw new DotaWatchError('DOTA_SOURCE_FETCH', sourceKey);
    }
  };
  const [steamResponse, patchResponse] = await Promise.all([fetchSource('steam_news'), fetchSource('patch_notes')]);
  const steamPayload = await readBoundedJson(steamResponse, MAX_STEAM_BYTES, 'steam_news');
  const patchPayload = await readBoundedJson(patchResponse, MAX_PATCH_BYTES, 'patch_notes');
  const items = [...parseSteamNews(steamPayload), ...parsePatchList(patchPayload)];
  const stored = await input.repo.storeSync({ items, detectedAt: input.detectedAt });
  return { inserted: stored.inserted, fetched: 2 };
}

export function createD1DotaWatcherRepository(db: D1Database): DotaWatcherRepository {
  return {
    async storeSync({ items, detectedAt }) {
      const statements: D1PreparedStatement[] = [];
      const insertRanges: { start: number; end: number }[] = [];
      for (const sourceKey of DOTA_SOURCE_KEYS) {
        statements.push(
          db
            .prepare('INSERT OR IGNORE INTO dota_source_state (source_key, baseline_seeded) VALUES (?1, 0)')
            .bind(sourceKey)
        );
        const sourceItems = items.filter((item) => item.sourceKey === sourceKey);
        for (let start = 0; start < sourceItems.length; start += INSERT_CHUNK_SIZE) {
          const chunk = sourceItems.slice(start, start + INSERT_CHUNK_SIZE);
          const sourceLiteral = sourceKey === 'steam_news' ? "'steam_news'" : "'patch_notes'";
          const values = chunk
            .map(
              () =>
                `(${sourceLiteral}, ? , ?, ?, ?, ?, (SELECT CASE WHEN baseline_seeded = 0 THEN 1 ELSE 0 END FROM dota_source_state WHERE source_key = ${sourceLiteral}))`
            )
            .join(', ');
          const bindings: (string | number)[] = [];
          for (const item of chunk) {
            bindings.push(item.externalId, item.title, item.sourceUrl, item.publishedAt, detectedAt);
          }
          const statementIndex = statements.length;
          statements.push(
            db
              .prepare(
                `INSERT OR IGNORE INTO dota_update_items (source_key, external_id, title, source_url, published_at, detected_at, is_baseline) VALUES ${values}`
              )
              .bind(...bindings)
          );
          insertRanges.push({ start: statementIndex, end: statementIndex + 1 });
        }
        statements.push(
          db.prepare('UPDATE dota_source_state SET baseline_seeded = 1 WHERE source_key = ?1').bind(sourceKey)
        );
      }
      const results = await db.batch(statements);
      const inserted = insertRanges.reduce((sum, range) => sum + (results[range.start]?.meta.changes ?? 0), 0);
      return { inserted };
    }
  };
}
