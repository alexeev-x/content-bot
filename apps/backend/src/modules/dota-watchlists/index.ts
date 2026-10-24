import {
  addDotaWatchlistInputSchema,
  addDotaWatchlistResponseSchema,
  dotaPatchFactSchema,
  dotaWatchlistSchema,
  dotaWatchlistsSchema,
  type AddDotaWatchlistInput,
  type DotaPatchFactDto,
  type DotaWatchMatchDto,
  type DotaWatchlistsDto
} from '@alexeev/contracts';
import {
  completeIdempotencyStatement,
  type IdempotencyClaim,
  type IdempotencyKeyRef
} from '../../platform/idempotency/d1-idempotency-store';
import { sha256Hex } from '../../platform/security/sha256';
import { AppError } from '../../shared/app-error';

const MAX_WATCHES = 100;
const MAX_MATCHES = 100;
const MAX_MATCH_PAIRS = 10;

interface WatchRow {
  id: string;
  entity_type: 'hero' | 'item';
  entity_name: string;
  created_at: number;
}
interface MatchRow {
  id: string;
  watch_id: string;
  entity_type: 'hero' | 'item';
  entity_name: string;
  source_key: 'patch_notes';
  external_id: string;
  fact_json: string;
  title: string;
  source_url: string;
  published_at: number;
  detected_at: number;
  linked_draft_id: string | null;
  linked_draft_title: string | null;
  alert_status: DotaWatchMatchDto['alertStatus'];
  alert_error_code: string | null;
}
interface CandidateRow {
  watch_id: string;
  entity_type: 'hero' | 'item';
  entity_name: string;
  external_id: string;
  detected_at: number;
  fact_json: string;
}

export interface DotaWatchlistAlert {
  id: string;
  externalId: string;
  entityType: 'hero' | 'item';
  entityName: string;
  title: string;
}

export type DotaWatchlistRepository = ReturnType<typeof createD1DotaWatchlists>;

function epoch(value: number): string {
  return new Date(value).toISOString();
}
function entityKey(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

function watchDto(row: WatchRow, last: { id: string; title: string; detected_at: number } | null) {
  return dotaWatchlistSchema.parse({
    id: row.id,
    entityType: row.entity_type,
    entityName: row.entity_name,
    createdAt: epoch(row.created_at),
    lastMatchedUpdate: last === null ? null : { id: last.id, title: last.title, detectedAt: epoch(last.detected_at) }
  });
}

function matchDto(row: MatchRow): DotaWatchMatchDto {
  let fact: unknown;
  try {
    fact = JSON.parse(row.fact_json);
  } catch {
    throw new AppError('UNAVAILABLE', 'Stored watch match is invalid');
  }
  const parsedFact = dotaPatchFactSchema.safeParse(fact);
  if (!parsedFact.success) throw new AppError('UNAVAILABLE', 'Stored watch match is invalid');
  return {
    id: row.id,
    watchId: row.watch_id,
    entityType: row.entity_type,
    entityName: row.entity_name,
    update: {
      id: `${row.source_key}:${row.external_id}`,
      sourceKey: row.source_key,
      externalId: row.external_id,
      title: row.title,
      sourceUrl: row.source_url,
      publishedAt: epoch(row.published_at),
      detectedAt: epoch(row.detected_at),
      ...(row.linked_draft_id !== null && row.linked_draft_title !== null
        ? { linkedDraft: { id: row.linked_draft_id, title: row.linked_draft_title } }
        : {})
    },
    fact: parsedFact.data,
    alertStatus: row.alert_status,
    ...(row.alert_error_code === null ? {} : { alertErrorCode: row.alert_error_code })
  };
}

async function listDotaWatchlists(db: D1Database): Promise<DotaWatchlistsDto> {
  const [watchRows, matchRows] = await Promise.all([
    db
      .prepare(
        `SELECT w.id, w.entity_type, w.entity_name, w.created_at,
              (SELECT m.external_id FROM dota_watch_matches m WHERE m.watch_id = w.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_external_id,
              (SELECT u.title FROM dota_watch_matches m JOIN dota_update_items u ON u.source_key = m.source_key AND u.external_id = m.external_id
               WHERE m.watch_id = w.id AND u.source_url = 'https://www.dota2.com/patches/' || u.external_id
               ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_title,
              (SELECT u.detected_at FROM dota_watch_matches m JOIN dota_update_items u ON u.source_key = m.source_key AND u.external_id = m.external_id
               WHERE m.watch_id = w.id AND u.source_url = 'https://www.dota2.com/patches/' || u.external_id
               ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_detected_at
       FROM dota_watches w WHERE w.removed_at IS NULL ORDER BY w.created_at DESC, w.id DESC LIMIT ?1`
      )
      .bind(MAX_WATCHES)
      .all<
        WatchRow & { last_external_id: string | null; last_title: string | null; last_detected_at: number | null }
      >(),
    db
      .prepare(
        `SELECT m.id, m.watch_id, w.entity_type, w.entity_name, m.source_key, m.external_id, m.fact_json,
              u.title, u.source_url, u.published_at, u.detected_at, p.id AS linked_draft_id, p.title AS linked_draft_title,
              a.status AS alert_status, a.error_code AS alert_error_code
       FROM dota_watch_matches m JOIN dota_watches w ON w.id = m.watch_id
       JOIN dota_update_items u ON u.source_key = m.source_key AND u.external_id = m.external_id
       JOIN dota_watch_alerts a ON a.match_id = m.id LEFT JOIN posts p ON p.id = u.draft_post_id AND p.deleted_at IS NULL
       WHERE u.source_url = 'https://www.dota2.com/patches/' || u.external_id
       ORDER BY m.created_at DESC, m.id DESC LIMIT ?1`
      )
      .bind(MAX_MATCHES)
      .all<MatchRow>()
  ]);
  const dto = {
    watches: watchRows.results.map((row) =>
      watchDto(
        row,
        row.last_external_id === null || row.last_title === null || row.last_detected_at === null
          ? null
          : { id: `patch_notes:${row.last_external_id}`, title: row.last_title, detected_at: row.last_detected_at }
      )
    ),
    matches: matchRows.results.map(matchDto)
  };
  return dotaWatchlistsSchema.parse(dto);
}

type DotaWatchableFact = Omit<DotaPatchFactDto, 'entityType'> & { entityType: 'hero' | 'item' };

async function findConfirmedFact(db: D1Database, input: AddDotaWatchlistInput): Promise<DotaWatchableFact> {
  const row = await db
    .prepare(
      `SELECT a.parse_status, a.facts_json FROM dota_patch_analyses a
     JOIN dota_update_items u ON u.source_key = a.source_key AND u.external_id = a.external_id
     WHERE a.source_key = ?1 AND a.external_id = ?2 AND u.source_url = ?3 AND u.is_baseline = 0`
    )
    .bind(input.sourceKey, input.externalId, `https://www.dota2.com/patches/${encodeURIComponent(input.externalId)}`)
    .first<{ parse_status: string; facts_json: string }>();
  if (row === null || !['complete', 'incomplete'].includes(row.parse_status))
    throw new AppError('VALIDATION_ERROR', 'Watch must reference a persisted confirmed patch fact');
  let facts: unknown;
  try {
    facts = JSON.parse(row.facts_json);
  } catch {
    throw new AppError('UNAVAILABLE', 'Stored patch facts are invalid');
  }
  const parsed = dotaPatchFactSchema.array().max(500).safeParse(facts);
  if (!parsed.success) throw new AppError('UNAVAILABLE', 'Stored patch facts are invalid');
  const fact = parsed.data.find((entry) => entry.id === input.factId);
  if (fact === undefined || (fact.entityType !== 'hero' && fact.entityType !== 'item'))
    throw new AppError('VALIDATION_ERROR', 'Only confirmed hero and item facts can be watched');
  return fact as DotaWatchableFact;
}

export async function addDotaWatchlist(input: {
  db: D1Database;
  actor: string;
  key: string;
  rawInput: unknown;
  now: number;
  newId: () => string;
  idempotency: {
    claim(scope: string, key: string, hash: string, now: number): Promise<IdempotencyClaim>;
    release(ref: IdempotencyKeyRef): Promise<void>;
  };
}): Promise<{ status: 200 | 201; body: unknown }> {
  const body = addDotaWatchlistInputSchema.parse(input.rawInput);
  const requestHash = await sha256Hex(JSON.stringify(body));
  const claim = await input.idempotency.claim(input.actor, input.key, requestHash, input.now);
  if (claim.kind === 'reused')
    throw new AppError('CONFLICT', 'Idempotency key was already used for another request', {
      reason: 'IDEMPOTENCY_KEY_REUSED'
    });
  if (claim.kind === 'in_flight')
    throw new AppError('CONFLICT', 'This request is still in progress', { reason: 'IN_FLIGHT' });
  if (claim.kind === 'replay') {
    const stored = await input.db
      .prepare('SELECT response_status, response_body FROM idempotency_keys WHERE scope = ?1 AND key = ?2')
      .bind(input.actor, input.key)
      .first<{ response_status: number; response_body: string }>();
    if (stored === null) throw new AppError('UNAVAILABLE', 'Idempotent response is missing');
    return { status: stored.response_status as 200 | 201, body: JSON.parse(stored.response_body) as unknown };
  }
  const ref = { scope: input.actor, key: input.key, requestHash, claimedAt: input.now };
  try {
    const fact = await findConfirmedFact(input.db, body);
    const key = entityKey(fact.entityName);
    const existing = await input.db
      .prepare(
        'SELECT id, entity_type, entity_name, created_at FROM dota_watches WHERE entity_type = ?1 AND entity_key = ?2 AND removed_at IS NULL'
      )
      .bind(fact.entityType, key)
      .first<WatchRow>();
    if (existing !== null) {
      const dto = addDotaWatchlistResponseSchema.parse({ watch: watchDto(existing, null), created: false });
      const completion = await input.db.batch([
        completeIdempotencyStatement(input.db, ref, { status: 200, body: JSON.stringify(dto) }, input.now, {
          sql: 'EXISTS (SELECT 1 FROM dota_watches WHERE id = ?8 AND removed_at IS NULL)',
          bindings: [existing.id]
        })
      ]);
      if (completion[0]?.meta.changes !== 1)
        throw new AppError('CONFLICT', 'Watch changed while the request was being saved');
      return { status: 200, body: dto };
    }

    const id = input.newId();
    const createdRow: WatchRow = {
      id,
      entity_type: fact.entityType,
      entity_name: fact.entityName,
      created_at: input.now
    };
    const createdDto = addDotaWatchlistResponseSchema.parse({ watch: watchDto(createdRow, null), created: true });
    const writes = await input.db.batch([
      input.db
        .prepare(
          `INSERT INTO dota_watches (id, entity_type, entity_name, entity_key, created_at)
         SELECT ?1, ?2, ?3, ?4, ?5
         WHERE (SELECT count(*) FROM dota_watches WHERE removed_at IS NULL) < ?6
         ON CONFLICT(entity_type, entity_key) WHERE removed_at IS NULL DO NOTHING`
        )
        .bind(id, fact.entityType, fact.entityName, key, input.now, MAX_WATCHES),
      completeIdempotencyStatement(input.db, ref, { status: 201, body: JSON.stringify(createdDto) }, input.now, {
        sql: 'EXISTS (SELECT 1 FROM dota_watches WHERE id = ?8 AND removed_at IS NULL)',
        bindings: [id]
      })
    ]);
    if (writes[0]?.meta.changes === 1 && writes[1]?.meta.changes === 1) return { status: 201, body: createdDto };

    await input.idempotency.release(ref);
    const retryClaim = await input.idempotency.claim(input.actor, input.key, requestHash, input.now);
    if (retryClaim.kind !== 'claimed')
      throw new AppError('CONFLICT', 'Watch changed while the request was being saved');
    const raced = await input.db
      .prepare(
        'SELECT id, entity_type, entity_name, created_at FROM dota_watches WHERE entity_type = ?1 AND entity_key = ?2 AND removed_at IS NULL'
      )
      .bind(fact.entityType, key)
      .first<WatchRow>();
    if (raced === null)
      throw new AppError('CONFLICT', 'The active watch limit has been reached', { reason: 'WATCH_LIMIT' });
    const dto = addDotaWatchlistResponseSchema.parse({ watch: watchDto(raced, null), created: false });
    const completed = await input.db.batch([
      completeIdempotencyStatement(input.db, ref, { status: 200, body: JSON.stringify(dto) }, input.now, {
        sql: 'EXISTS (SELECT 1 FROM dota_watches WHERE id = ?8 AND removed_at IS NULL)',
        bindings: [raced.id]
      })
    ]);
    if (completed[0]?.meta.changes !== 1) throw new AppError('CONFLICT', 'Idempotency claim expired');
    return { status: 200, body: dto };
  } catch (error) {
    await input.idempotency.release(ref);
    throw error;
  }
}

async function removeDotaWatchlist(db: D1Database, id: string, now: number): Promise<void> {
  await db.prepare('UPDATE dota_watches SET removed_at = ?2 WHERE id = ?1 AND removed_at IS NULL').bind(id, now).run();
}

export async function processDotaWatchlistMatches(deps: {
  db: D1Database;
  now: number;
  newId: () => string;
  notificationsEnabled: boolean;
}): Promise<{ matched: number; disabled: number; unknown: number }> {
  const summary = { matched: 0, disabled: 0, unknown: 0 };
  const candidates = await deps.db
    .prepare(
      `SELECT w.id AS watch_id, w.entity_type, w.entity_name, u.external_id, u.detected_at, f.value AS fact_json
       FROM dota_update_items u INDEXED BY dota_update_items_patch_detected_idx
       JOIN dota_patch_analyses a ON a.source_key = u.source_key AND a.external_id = u.external_id
       JOIN json_each(a.facts_json) f
       JOIN dota_watches w ON w.removed_at IS NULL
         AND w.entity_type = json_extract(f.value, '$.entityType')
         AND w.entity_key = lower(trim(json_extract(f.value, '$.entityName')))
       WHERE u.source_key = 'patch_notes' AND u.is_baseline = 0 AND u.detected_at <= ?1
         AND u.source_url = 'https://www.dota2.com/patches/' || u.external_id
         AND a.parse_status IN ('complete', 'incomplete') AND u.detected_at > w.created_at
         AND NOT EXISTS (SELECT 1 FROM dota_watch_matches m WHERE m.watch_id = w.id
           AND m.source_key = u.source_key AND m.external_id = u.external_id)
       LIMIT ?2`
    )
    .bind(deps.now, MAX_MATCH_PAIRS)
    .all<CandidateRow>();
  const writes: D1PreparedStatement[] = [];
  for (const update of candidates.results) {
    let facts: unknown;
    try {
      facts = JSON.parse(update.fact_json);
    } catch {
      continue;
    }
    const parsed = dotaPatchFactSchema.safeParse(facts);
    if (
      !parsed.success ||
      parsed.data.entityType !== update.entity_type ||
      entityKey(parsed.data.entityName) !== entityKey(update.entity_name)
    )
      continue;
    const matchId = deps.newId();
    const alertId = deps.newId();
    writes.push(
      deps.db
        .prepare(
          `INSERT OR IGNORE INTO dota_watch_matches (id, watch_id, source_key, external_id, fact_id, fact_json, created_at)
         VALUES (?1, ?2, 'patch_notes', ?3, ?4, ?5, ?6)`
        )
        .bind(matchId, update.watch_id, update.external_id, parsed.data.id, JSON.stringify(parsed.data), deps.now)
    );
    writes.push(
      deps.db
        .prepare(
          `INSERT OR IGNORE INTO dota_watch_alerts (id, match_id, status, created_at, updated_at)
         SELECT ?1, id, ?2, ?3, ?3 FROM dota_watch_matches WHERE watch_id = ?4 AND source_key = 'patch_notes' AND external_id = ?5`
        )
        .bind(
          alertId,
          deps.notificationsEnabled ? 'pending' : 'disabled',
          deps.now,
          update.watch_id,
          update.external_id
        )
    );
  }
  if (writes.length > 0) {
    const results = await deps.db.batch(writes);
    for (let index = 0; index < results.length; index += 2) {
      if (results[index]?.meta.changes === 1) summary.matched += 1;
      if (results[index + 1]?.meta.changes === 1 && !deps.notificationsEnabled) summary.disabled += 1;
    }
  }
  if (!deps.notificationsEnabled) {
    const disabled = await deps.db
      .prepare(
        `UPDATE dota_watch_alerts SET status = 'disabled', updated_at = ?1
       WHERE status = 'pending'`
      )
      .bind(deps.now)
      .run();
    summary.disabled += disabled.meta.changes;
  }
  // A send marker older than its timeout can only be a worker crash. It is never reclaimed.
  const stale = await deps.db
    .prepare(
      `UPDATE dota_watch_alerts SET status = 'unknown', error_code = 'WORKER_INTERRUPTED', updated_at = ?1
     WHERE status = 'sending' AND send_started_at < ?2`
    )
    .bind(deps.now, deps.now - 6_000)
    .run();
  summary.unknown += stale.meta.changes;
  return summary;
}

async function listPendingDotaWatchlistAlerts(db: D1Database, limit: number): Promise<DotaWatchlistAlert[]> {
  const pending = await db
    .prepare(
      `SELECT a.id, m.external_id, w.entity_type, w.entity_name, u.title
       FROM dota_watch_alerts a JOIN dota_watch_matches m ON m.id = a.match_id
       JOIN dota_watches w ON w.id = m.watch_id
       JOIN dota_update_items u ON u.source_key = m.source_key AND u.external_id = m.external_id
       WHERE a.status = 'pending' AND w.removed_at IS NULL
         AND u.source_url = 'https://www.dota2.com/patches/' || u.external_id
       ORDER BY a.created_at, a.id LIMIT ?1`
    )
    .bind(limit)
    .all<{ id: string; external_id: string; entity_type: 'hero' | 'item'; entity_name: string; title: string }>();
  return pending.results.map((row) => ({
    id: row.id,
    externalId: row.external_id,
    entityType: row.entity_type,
    entityName: row.entity_name,
    title: row.title
  }));
}

async function claimDotaWatchlistAlert(db: D1Database, id: string, now: number): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE dota_watch_alerts SET status = 'sending', send_started_at = ?2, updated_at = ?2
       WHERE id = ?1 AND status = 'pending'
         AND EXISTS (
           SELECT 1 FROM dota_watch_matches m JOIN dota_watches w ON w.id = m.watch_id
           WHERE m.id = dota_watch_alerts.match_id AND w.removed_at IS NULL
         )`
    )
    .bind(id, now)
    .run();
  return result.meta.changes === 1;
}

export async function finishDotaWatchlistAlert(
  db: D1Database,
  input: { id: string; now: number; status: 'sent' | 'failed' | 'unknown'; errorCode?: string }
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE dota_watch_alerts SET status = ?2, error_code = ?3, updated_at = ?4
       WHERE id = ?1 AND status = 'sending'`
    )
    .bind(input.id, input.status, input.errorCode ?? null, input.now)
    .run();
  return result.meta.changes === 1;
}

export function createD1DotaWatchlists(db: D1Database) {
  return {
    list: () => listDotaWatchlists(db),
    add: (input: Omit<Parameters<typeof addDotaWatchlist>[0], 'db'>) => addDotaWatchlist({ ...input, db }),
    remove: (id: string, now: number) => removeDotaWatchlist(db, id, now),
    processMatches: (input: Omit<Parameters<typeof processDotaWatchlistMatches>[0], 'db'>) =>
      processDotaWatchlistMatches({ ...input, db }),
    listPending: (limit: number) => listPendingDotaWatchlistAlerts(db, limit),
    claimAlert: (id: string, now: number) => claimDotaWatchlistAlert(db, id, now),
    finishAlert: (input: Parameters<typeof finishDotaWatchlistAlert>[1]) => finishDotaWatchlistAlert(db, input)
  };
}
