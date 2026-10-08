import { z } from 'zod';

export const DOTA_SOURCE_KEYS = ['steam_news', 'patch_notes'] as const;
export type DotaSourceKey = (typeof DOTA_SOURCE_KEYS)[number];

const steamNewsItemSchema = z
  .object({
    gid: z.string().min(1).max(100),
    title: z.string().trim().min(1).max(500),
    url: z.string().url().max(2048),
    date: z.number().int().nonnegative().max(8_640_000_000_000),
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
    patch_timestamp: z.number().int().nonnegative().max(8_640_000_000_000),
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
// Five bound values per item; 20 rows reaches but never exceeds D1's 100-parameter cap.
const INSERT_CHUNK_SIZE = 20;

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
  recordSourceFailure(input: {
    sourceKey: DotaSourceKey;
    code: DotaWatchError['code'];
    detectedAt: number;
    id: string;
  }): Promise<string>;
  listDraftWork(limit: number): Promise<DotaDraftSource[]>;
  reserveDraft(input: { sourceKey: DotaSourceKey; externalId: string; postId: string }): Promise<string | null>;
  listOwnerAlertWork(limit: number): Promise<DotaDraftSource[]>;
  claimDraftOwnerAlert(input: { sourceKey: DotaSourceKey; externalId: string; claimedAt: number }): Promise<boolean>;
  listSourceIncidentAlerts(limit: number): Promise<DotaSourceIncident[]>;
  claimSourceIncidentAlert(input: { id: string; claimedAt: number }): Promise<{ resolvedAt: number | null } | null>;
}

export interface DotaDraftSource extends DotaUpdateItem {
  isBaseline: boolean;
  draftPostId: string | null;
}

export interface DotaSourceIncident {
  id: string;
  sourceKey: DotaSourceKey;
  code: DotaWatchError['code'];
  resolvedAt: number | null;
}

export const DOTA_DRAFT_WORK_SQL = `
  SELECT u.source_key, u.external_id, u.title, u.source_url, u.published_at, u.is_baseline, u.draft_post_id
  FROM dota_update_items u INDEXED BY dota_draft_candidates_idx
  WHERE u.is_baseline = 0 AND u.draft_post_id IS NULL
  ORDER BY u.published_at, u.source_key, u.external_id LIMIT ?1`;

export const DOTA_DRAFT_RECOVERY_SQL = `
  SELECT u.source_key, u.external_id, u.title, u.source_url, u.published_at, u.is_baseline, u.draft_post_id
  FROM dota_update_items u INDEXED BY dota_draft_recovery_idx LEFT JOIN posts p ON p.id = u.draft_post_id
  WHERE u.is_baseline = 0 AND u.draft_post_id IS NOT NULL AND u.owner_alert_claimed_at IS NULL AND p.id IS NULL
  ORDER BY u.published_at, u.source_key, u.external_id LIMIT ?1`;

export const DOTA_OWNER_ALERT_WORK_SQL = `
  SELECT u.source_key, u.external_id, u.title, u.source_url, u.published_at, u.is_baseline, u.draft_post_id
  FROM dota_update_items u INDEXED BY dota_draft_recovery_idx JOIN posts p ON p.id = u.draft_post_id
  WHERE u.is_baseline = 0 AND u.draft_post_id IS NOT NULL AND u.owner_alert_claimed_at IS NULL
  ORDER BY u.published_at, u.source_key, u.external_id LIMIT ?1`;

export const DOTA_SOURCE_INCIDENT_ALERT_SQL = `
  SELECT id, source_key, code, resolved_at FROM dota_source_incidents INDEXED BY dota_source_incidents_alert_idx
  WHERE owner_alert_claimed_at IS NULL
  ORDER BY created_at, id LIMIT ?1`;

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
      // Item writes, baseline advancement and incident recovery are one atomic source sync.
      statements.push(
        db
          .prepare('UPDATE dota_source_incidents SET resolved_at = max(created_at, ?1) WHERE resolved_at IS NULL')
          .bind(detectedAt)
      );
      const results = await db.batch(statements);
      const inserted = insertRanges.reduce((sum, range) => sum + (results[range.start]?.meta.changes ?? 0), 0);
      return { inserted };
    },

    async recordSourceFailure({ sourceKey, code, detectedAt, id }) {
      const result = await db
        .prepare(
          `INSERT OR IGNORE INTO dota_source_incidents (id, source_key, code, created_at)
           VALUES (?1, ?2, ?3, ?4)`
        )
        .bind(id, sourceKey, code, detectedAt)
        .run();
      if (result.meta.changes === 1) return id;
      const existing = await db
        .prepare('SELECT id FROM dota_source_incidents WHERE source_key = ?1 AND resolved_at IS NULL')
        .bind(sourceKey)
        .first<{ id: string }>();
      if (existing === null) throw new Error('DOTA_INCIDENT_WRITE_FAILED');
      return existing.id;
    },

    async listDraftWork(limit) {
      const results = await db.batch([
        db.prepare(DOTA_DRAFT_WORK_SQL).bind(limit),
        db.prepare(DOTA_DRAFT_RECOVERY_SQL).bind(limit)
      ]);
      const newRows = ((results[0]?.results ?? []) as DotaDraftRow[]).map(toDraftSource);
      const recoveryRows = ((results[1]?.results ?? []) as DotaDraftRow[]).map(toDraftSource);
      const work: DotaDraftSource[] = [];
      while (work.length < limit && (newRows.length > 0 || recoveryRows.length > 0)) {
        const nextNew = newRows[0];
        const nextRecovery = recoveryRows[0];
        if (nextRecovery === undefined || (nextNew !== undefined && compareDotaSources(nextNew, nextRecovery) <= 0)) {
          const next = newRows.shift();
          if (next !== undefined) work.push(next);
        } else {
          const next = recoveryRows.shift();
          if (next !== undefined) work.push(next);
        }
      }
      return work;
    },

    async reserveDraft({ sourceKey, externalId, postId }) {
      const result = await db
        .prepare(
          `UPDATE dota_update_items SET draft_post_id = ?3
           WHERE source_key = ?1 AND external_id = ?2 AND is_baseline = 0 AND draft_post_id IS NULL`
        )
        .bind(sourceKey, externalId, postId)
        .run();
      if (result.meta.changes === 1) return postId;
      const row = await db
        .prepare(
          'SELECT draft_post_id FROM dota_update_items WHERE source_key = ?1 AND external_id = ?2 AND is_baseline = 0'
        )
        .bind(sourceKey, externalId)
        .first<{ draft_post_id: string | null }>();
      return row?.draft_post_id ?? null;
    },

    async listOwnerAlertWork(limit) {
      const { results } = await db.prepare(DOTA_OWNER_ALERT_WORK_SQL).bind(limit).all<DotaDraftRow>();
      return results.map(toDraftSource);
    },

    async claimDraftOwnerAlert({ sourceKey, externalId, claimedAt }) {
      const result = await db
        .prepare(
          `UPDATE dota_update_items SET owner_alert_claimed_at = ?3
           WHERE source_key = ?1 AND external_id = ?2 AND is_baseline = 0
             AND draft_post_id IS NOT NULL AND owner_alert_claimed_at IS NULL
             AND EXISTS (SELECT 1 FROM posts WHERE id = dota_update_items.draft_post_id)`
        )
        .bind(sourceKey, externalId, claimedAt)
        .run();
      return result.meta.changes === 1;
    },

    async listSourceIncidentAlerts(limit) {
      const { results } = await db.prepare(DOTA_SOURCE_INCIDENT_ALERT_SQL).bind(limit).all<{
        id: string;
        source_key: DotaSourceKey;
        code: DotaWatchError['code'];
        resolved_at: number | null;
      }>();
      return results.map((row) => ({
        id: row.id,
        sourceKey: row.source_key,
        code: row.code,
        resolvedAt: row.resolved_at
      }));
    },

    async claimSourceIncidentAlert({ id, claimedAt }) {
      const { results } = await db
        .prepare(
          `UPDATE dota_source_incidents SET owner_alert_claimed_at = ?2
           WHERE id = ?1 AND owner_alert_claimed_at IS NULL RETURNING resolved_at`
        )
        .bind(id, claimedAt)
        .all<{ resolved_at: number | null }>();
      const row = results[0];
      return row === undefined ? null : { resolvedAt: row.resolved_at };
    }
  };
}

interface DotaDraftRow {
  source_key: DotaSourceKey;
  external_id: string;
  title: string;
  source_url: string;
  published_at: number;
  is_baseline: number;
  draft_post_id: string | null;
}

function toDraftSource(row: DotaDraftRow): DotaDraftSource {
  return {
    sourceKey: row.source_key,
    externalId: row.external_id,
    title: row.title,
    sourceUrl: row.source_url,
    publishedAt: row.published_at,
    isBaseline: row.is_baseline === 1,
    draftPostId: row.draft_post_id
  };
}

function compareDotaSources(left: DotaDraftSource, right: DotaDraftSource): number {
  return (
    left.publishedAt - right.publishedAt ||
    left.sourceKey.localeCompare(right.sourceKey) ||
    left.externalId.localeCompare(right.externalId)
  );
}
