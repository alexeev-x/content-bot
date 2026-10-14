import type {
  PublicationStatus,
  SourceEventDto,
  SourceEventEntityDto,
  SourceEventPageDto,
  SourceEventStatus
} from '@alexeev/contracts';
import {
  eventSummary,
  watchKey,
  type DotaSourceKey,
  type EventDraftSource,
  type SourceEventType
} from './source-events';

export interface SourceEventKey {
  sourceKey: DotaSourceKey;
  externalId: string;
}

export function parseSourceEventId(id: string): SourceEventKey | null {
  const separator = id.indexOf(':');
  const sourceKey = id.slice(0, separator);
  if (separator < 0 || (sourceKey !== 'steam_news' && sourceKey !== 'patch_notes')) return null;
  return { sourceKey, externalId: id.slice(separator + 1) };
}

export interface SourceEventDraftInput {
  event: SourceEventDto;
  source: EventDraftSource & SourceEventKey;
  draftPostId: string | null;
  entities: SourceEventEntityDto[];
  watched: ReadonlySet<string>;
}

export interface SourceEventsRepository {
  list(input: {
    status?: SourceEventStatus | undefined;
    type?: SourceEventType | undefined;
    page: number;
    limit: number;
  }): Promise<SourceEventPageDto>;
  find(id: SourceEventKey): Promise<SourceEventDto | null>;
  /** Idempotent; false when no such event exists. */
  setHidden(id: SourceEventKey, hiddenAt: number | null): Promise<boolean>;
  loadDraftInput(id: SourceEventKey): Promise<SourceEventDraftInput | null>;
  /** Active watches as `watchKey`s; the draft template lists watched entities first. */
  watchedKeys(): Promise<Set<string>>;
}

interface EventRow {
  source_key: DotaSourceKey;
  external_id: string;
  title: string;
  source_url: string;
  published_at: number;
  detected_at: number;
  excerpt: string | null;
  event_type: SourceEventType;
  post_id: string | null;
  post_title: string | null;
  job_status: string | null;
  status: SourceEventStatus;
}

// Three layers because SQLite cannot reuse a select alias in the same SELECT: the job state of the draft's
// latest publication, then the event status derived from it, then the filter and page.
const eventsSql = (extraWhere: string, filter: string): string => `
  SELECT source_key, external_id, title, source_url, published_at, detected_at, excerpt, event_type,
         post_id, post_title, job_status, status
  FROM (
    SELECT source_key, external_id, title, source_url, published_at, detected_at, excerpt, event_type,
           post_id, post_title, job_status,
           CASE WHEN hidden_at IS NOT NULL THEN 'hidden'
                WHEN post_id IS NULL THEN 'new'
                WHEN job_status = 'succeeded' THEN 'published'
                ELSE 'drafted' END AS status
    FROM (
      SELECT u.source_key, u.external_id, u.title, u.source_url, u.published_at, u.detected_at, u.excerpt,
             u.event_type, u.hidden_at, p.id AS post_id, p.title AS post_title,
             (SELECT j.status FROM publications pu JOIN jobs j ON j.publication_id = pu.id AND j.kind = 'publish'
              WHERE pu.post_id = p.id ORDER BY pu.created_at DESC, pu.id DESC LIMIT 1) AS job_status
      FROM dota_update_items u LEFT JOIN posts p ON p.id = u.draft_post_id
      WHERE u.is_baseline = 0 ${extraWhere}
    )
  )
  WHERE 1 = 1 ${filter}`;

const ORDER = 'ORDER BY published_at DESC, source_key ASC, external_id ASC';

const PUBLICATION_STATUS: Record<string, PublicationStatus> = {
  pending: 'queued',
  retry_wait: 'retry_wait',
  claimed: 'sending',
  succeeded: 'sent',
  failed: 'failed',
  unknown: 'unknown',
  cancelled: 'cancelled'
};

const SOURCE_NAME: Record<DotaSourceKey, string> = {
  steam_news: 'Steam News',
  patch_notes: 'Dota 2 patch notes'
};

interface FactRow {
  external_id: string;
  entity_type: 'hero' | 'item' | 'neutral_item';
  entity_name: string;
}

const MAX_ENTITIES_PER_EVENT = 500;

export function createD1SourceEventsRepository(db: D1Database): SourceEventsRepository {
  async function watched(): Promise<{ keys: Set<string> }> {
    const { results } = await db
      .prepare('SELECT entity_type, entity_key FROM dota_watches WHERE removed_at IS NULL LIMIT 100')
      .all<{ entity_type: 'hero' | 'item'; entity_key: string }>();
    return { keys: new Set(results.map((row) => `${row.entity_type}:${row.entity_key}`)) };
  }

  async function entitiesOf(externalIds: string[]): Promise<Map<string, SourceEventEntityDto[]>> {
    const byEvent = new Map<string, SourceEventEntityDto[]>();
    if (externalIds.length === 0) return byEvent;
    const { results } = await db
      .prepare(
        `SELECT a.external_id AS external_id, json_extract(f.value, '$.entityType') AS entity_type,
                json_extract(f.value, '$.entityName') AS entity_name
         FROM dota_patch_analyses a, json_each(a.facts_json) f
         WHERE a.source_key = 'patch_notes' AND a.external_id IN (${externalIds.map(() => '?').join(', ')})
           AND json_extract(f.value, '$.entityType') IN ('hero', 'item', 'neutral_item')
         GROUP BY a.external_id, entity_type, entity_name
         ORDER BY a.external_id, MIN(f.key)`
      )
      .bind(...externalIds)
      .all<FactRow>();
    const seen = new Set<string>();
    for (const row of results) {
      const kind = row.entity_type === 'hero' ? 'hero' : 'item';
      const key = `${row.external_id}\u0000${watchKey(kind, row.entity_name)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const list = byEvent.get(row.external_id) ?? [];
      if (list.length < MAX_ENTITIES_PER_EVENT) list.push({ kind, name: row.entity_name });
      byEvent.set(row.external_id, list);
    }
    return byEvent;
  }

  function toDto(raw: EventRow, entities: SourceEventEntityDto[], keys: ReadonlySet<string>): SourceEventDto {
    // Patch notes are always a patch (see dota/index.ts: rows written between migration 0037 and the deploy).
    const row = raw.source_key === 'patch_notes' ? { ...raw, event_type: 'patch' as const } : raw;
    const hits = entities.filter((entity) => keys.has(watchKey(entity.kind, entity.name))).slice(0, 100);
    return {
      id: `${row.source_key}:${row.external_id}`,
      type: row.event_type,
      title: row.title,
      sourceName: SOURCE_NAME[row.source_key],
      sourceUrl: row.source_url,
      publishedAt: new Date(row.published_at).toISOString(),
      detectedAt: new Date(row.detected_at).toISOString(),
      summary: eventSummary({ type: row.event_type, title: row.title, excerpt: row.excerpt, entities }),
      facts: row.event_type === 'patch' ? entities : [],
      watchHits: row.event_type === 'patch' ? hits : [],
      status: row.status,
      draft: row.post_id === null ? null : { postId: row.post_id, title: row.post_title ?? '' },
      publication:
        row.post_id === null || row.job_status === null
          ? null
          : { status: PUBLICATION_STATUS[row.job_status] ?? 'unknown' }
    };
  }

  async function hydrate(rows: EventRow[]): Promise<{ dtos: SourceEventDto[]; keys: Set<string> }> {
    const patchIds = rows.filter((row) => row.event_type === 'patch').map((row) => row.external_id);
    const [entities, { keys }] = await Promise.all([entitiesOf(patchIds), watched()]);
    return { dtos: rows.map((row) => toDto(row, entities.get(row.external_id) ?? [], keys)), keys };
  }

  return {
    async list({ status, type, page, limit }) {
      const binds: string[] = [];
      let extra = '';
      if (type !== undefined) {
        binds.push(type);
        extra = ` AND u.event_type = ?${binds.length}`;
      }
      let filter = '';
      if (status !== undefined) {
        binds.push(status);
        filter = ` AND status = ?${binds.length}`;
      }
      const base = eventsSql(extra, filter);
      const [count, rows] = await db.batch([
        db.prepare(`SELECT COUNT(*) AS total FROM (${base})`).bind(...binds),
        db.prepare(`${base} ${ORDER} LIMIT ${Number(limit)} OFFSET ${Number((page - 1) * limit)}`).bind(...binds)
      ]);
      const total = (count?.results[0] as { total: number } | undefined)?.total ?? 0;
      const { dtos } = await hydrate((rows?.results ?? []) as EventRow[]);
      return { items: dtos, nextCursor: null, page, totalCount: total };
    },

    async find({ sourceKey, externalId }) {
      const row = await db
        .prepare(eventsSql(' AND u.source_key = ?1 AND u.external_id = ?2', ''))
        .bind(sourceKey, externalId)
        .first<EventRow>();
      if (row === null) return null;
      return (await hydrate([row])).dtos[0] ?? null;
    },

    async setHidden({ sourceKey, externalId }, hiddenAt) {
      const result = await db
        .prepare(
          `UPDATE dota_update_items SET hidden_at = CASE WHEN ?3 IS NULL THEN NULL ELSE COALESCE(hidden_at, ?3) END
           WHERE source_key = ?1 AND external_id = ?2 AND is_baseline = 0`
        )
        .bind(sourceKey, externalId, hiddenAt)
        .run();
      return result.meta.changes === 1;
    },

    async loadDraftInput({ sourceKey, externalId }) {
      const row = await db
        .prepare(eventsSql(' AND u.source_key = ?1 AND u.external_id = ?2', ''))
        .bind(sourceKey, externalId)
        .first<EventRow>();
      if (row === null) return null;
      const reserved = await db
        .prepare('SELECT draft_post_id FROM dota_update_items WHERE source_key = ?1 AND external_id = ?2')
        .bind(sourceKey, externalId)
        .first<{ draft_post_id: string | null }>();
      const { dtos, keys } = await hydrate([row]);
      const event = dtos[0];
      if (event === undefined) return null;
      return {
        event,
        source: {
          sourceKey,
          externalId,
          type: row.event_type,
          title: row.title,
          excerpt: row.excerpt,
          sourceUrl: row.source_url
        },
        draftPostId: reserved?.draft_post_id ?? null,
        entities: event.facts,
        watched: keys
      };
    },

    async watchedKeys() {
      return (await watched()).keys;
    }
  };
}
