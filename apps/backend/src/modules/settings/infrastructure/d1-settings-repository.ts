import type { SettingKey, SettingsRepository } from '../application/ports';

interface SettingRow {
  value: string;
  revision: number;
  updated_at: number;
}

// The row is at `?2` when its revision equals it. A revision that is not a safe positive integer
// (a hand-edited row; the CHECK lets 1.5 or text through) counts as revision 1, which is also what
// the read path reports, so the owner can always repair such a row with an ordinary save.
const AT_REVISION = `(revision = ?2 OR (?2 = 1 AND NOT (typeof(revision) = 'integer' AND revision BETWEEN 1 AND 9007199254740991)))`;

const AUDIT_ACTIONS: Record<SettingKey, string> = {
  appearance: 'settings.appearance.update',
  operations: 'settings.operations.update'
};

export function createD1SettingsRepository(db: D1Database): SettingsRepository {
  return {
    async find(key) {
      const row = await db
        .prepare('SELECT value, revision, updated_at FROM settings WHERE key = ?1')
        .bind(key)
        .first<SettingRow>();
      return row === null ? null : { value: row.value, revision: row.revision, updatedAt: row.updated_at };
    },

    async save(write) {
      const details = JSON.stringify({ revision: write.expectedRevision + 1, fields: write.fields });
      // The audit row comes first: both statements carry the same guard, which is evaluated before
      // the write changes the row, so the two apply together or not at all. Revision 0 guards on
      // "no row": two first saves cannot both insert, and the loser changes nothing.
      const audit =
        write.expectedRevision === 0
          ? db
              .prepare(
                `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
                 SELECT ?2, ?3, 'settings', ?1, ?4, ?5
                 WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = ?1)`
              )
              .bind(write.key, write.actor, AUDIT_ACTIONS[write.key], write.now, details)
          : db
              .prepare(
                `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
                 SELECT ?3, ?4, 'settings', key, ?5, ?6 FROM settings WHERE key = ?1 AND ${AT_REVISION}`
              )
              .bind(write.key, write.expectedRevision, write.actor, AUDIT_ACTIONS[write.key], write.now, details);
      const change =
        write.expectedRevision === 0
          ? db
              .prepare(
                `INSERT INTO settings (key, value, revision, updated_at, updated_by)
                 SELECT ?1, ?2, 1, ?3, ?4 WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = ?1)`
              )
              .bind(write.key, write.value, write.now, write.actor)
          : db
              .prepare(
                `UPDATE settings SET value = ?3, revision = ?2 + 1, updated_at = ?4, updated_by = ?5
                 WHERE key = ?1 AND ${AT_REVISION}`
              )
              .bind(write.key, write.expectedRevision, write.value, write.now, write.actor);
      const results = await db.batch([audit, change]);
      return results[1]?.meta.changes === 1 ? 'saved' : 'not_applied';
    }
  };
}
