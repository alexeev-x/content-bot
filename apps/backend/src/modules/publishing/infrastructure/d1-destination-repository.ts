import type { DestinationKind } from '@alexeev/contracts';
import { completeIdempotencyStatement, ownsClaimSql } from '../../../platform/idempotency/d1-idempotency-store';
import type { DestinationRecord, DestinationRepository, ListDestinationsQuery } from '../application/ports';

interface DestinationRow {
  id: string;
  title: string;
  chat_id: string;
  kind: DestinationKind;
  enabled: number;
  revision: number;
  created_at: number;
  updated_at: number;
}

const DESTINATION_COLUMNS = 'id, title, chat_id, kind, enabled, revision, created_at, updated_at';

function toRecord(row: DestinationRow): DestinationRecord {
  return {
    id: row.id,
    title: row.title,
    chatId: row.chat_id,
    kind: row.kind,
    enabled: row.enabled === 1,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// D1 reports a violated UNIQUE as an error of the whole batch (which rolls back), naming the column.
function isChatIdTaken(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (current.message.includes('UNIQUE constraint failed: destinations.chat_id')) return true;
  }
  return false;
}

// Ordered by title. Each shape matches one index (destinations_title_idx / destinations_enabled_title_idx)
// so SQLite walks the index in order and never sorts. Only constant fragments are joined; every
// value is bound.
export function listDestinationsSql(query: Pick<ListDestinationsQuery, 'enabled' | 'after' | 'limit'>): {
  sql: string;
  bindings: (string | number)[];
} {
  const conditions: string[] = [];
  const bindings: (string | number)[] = [];
  if (query.enabled !== undefined) {
    conditions.push('enabled = ?');
    bindings.push(query.enabled ? 1 : 0);
  }
  if (query.after !== undefined) {
    // The leading range on title lets the index seek straight to the cursor; the OR only breaks
    // ties among rows that share the cursor's title.
    conditions.push('title >= ?', '(title > ? OR id > ?)');
    bindings.push(query.after.title, query.after.title, query.after.id);
  }
  bindings.push(query.limit);
  const where = conditions.length === 0 ? '' : ` WHERE ${conditions.join(' AND ')}`;
  return {
    sql: `SELECT ${DESTINATION_COLUMNS} FROM destinations${where} ORDER BY title, id LIMIT ?`,
    bindings
  };
}

export function createD1DestinationRepository(db: D1Database): DestinationRepository {
  return {
    async create({ record, actor, idempotency, response }) {
      const claim = [idempotency.scope, idempotency.key, idempotency.requestHash, idempotency.claimedAt];
      try {
        const results = await db.batch([
          db
            .prepare(
              `INSERT INTO destinations (id, title, chat_id, kind, enabled, revision, created_at, updated_at)
               SELECT ?1, ?2, ?3, ?4, 1, 0, ?5, ?5 WHERE ${ownsClaimSql(6)}`
            )
            .bind(record.id, record.title, record.chatId, record.kind, record.createdAt, ...claim),
          db
            .prepare(
              `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
               SELECT ?3, 'destination.create', 'destination', ?1, ?2, '{"revision":0}' WHERE ${ownsClaimSql(4)}`
            )
            .bind(record.id, record.createdAt, actor, ...claim),
          completeIdempotencyStatement(db, idempotency, response, record.createdAt)
        ]);
        return results[0]?.meta.changes === 1 ? 'created' : 'claim_lost';
      } catch (error) {
        if (isChatIdTaken(error)) return 'chat_id_taken';
        throw error;
      }
    },

    async findIdByChat({ chatId, username }) {
      // chat_id is COLLATE NOCASE, so `IN` matches a @username in any letter case and uses the unique index.
      const row = await db
        .prepare('SELECT id FROM destinations WHERE chat_id IN (?1, ?2) ORDER BY created_at, id LIMIT 1')
        .bind(chatId, username === null ? chatId : `@${username}`)
        .first<{ id: string }>();
      return row === null ? null : row.id;
    },

    async findById(id) {
      const row = await db
        .prepare(`SELECT ${DESTINATION_COLUMNS} FROM destinations WHERE id = ?1`)
        .bind(id)
        .first<DestinationRow>();
      return row === null ? null : toRecord(row);
    },

    async list(query) {
      const { sql, bindings } = listDestinationsSql(query);
      const { results } = await db
        .prepare(sql)
        .bind(...bindings)
        .all<DestinationRow>();
      return results.map(toRecord);
    },

    async update(change) {
      const fields = [
        ...(change.title === undefined ? [] : ['title']),
        ...(change.chatId === undefined ? [] : ['chatId']),
        ...(change.enabled === undefined ? [] : ['enabled'])
      ];
      try {
        // The audit row comes first: both statements carry the same guard, which is evaluated
        // before the UPDATE bumps the revision, so the two either apply together or not at all.
        const results = await db.batch<DestinationRow>([
          db
            .prepare(
              `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
               SELECT ?3, 'destination.update', 'destination', id, ?4, ?5
               FROM destinations WHERE id = ?1 AND revision = ?2`
            )
            .bind(
              change.id,
              change.expectedRevision,
              change.actor,
              change.now,
              JSON.stringify({ revision: change.expectedRevision + 1, fields })
            ),
          db
            .prepare(
              `UPDATE destinations
               SET title = COALESCE(?3, title), chat_id = COALESCE(?4, chat_id), enabled = COALESCE(?5, enabled),
                   revision = revision + 1, updated_at = ?6
               WHERE id = ?1 AND revision = ?2 RETURNING ${DESTINATION_COLUMNS}`
            )
            .bind(
              change.id,
              change.expectedRevision,
              change.title ?? null,
              change.chatId ?? null,
              change.enabled === undefined ? null : change.enabled ? 1 : 0,
              change.now
            )
        ]);
        const row = results[1]?.results[0];
        return row === undefined ? { kind: 'not_applied' } : { kind: 'updated', record: toRecord(row) };
      } catch (error) {
        if (isChatIdTaken(error)) return { kind: 'chat_id_taken' };
        throw error;
      }
    }
  };
}
