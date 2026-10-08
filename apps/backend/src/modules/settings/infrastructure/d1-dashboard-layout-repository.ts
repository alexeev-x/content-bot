import type { DashboardLayoutRepository } from '../application/ports';

interface LayoutRow {
  value: string;
  revision: number;
}

const AUDIT_ACTION = 'settings.dashboard_layout.update';
const AUDIT_ENTITY_ID = 'dashboard-layout';

export function createD1DashboardLayoutRepository(db: D1Database): DashboardLayoutRepository {
  return {
    async find() {
      return db.prepare('SELECT value, revision FROM dashboard_layout WHERE id = 1').first<LayoutRow>();
    },

    async save(write) {
      const details = JSON.stringify({ revision: write.expectedRevision + 1, widgets: write.widgetCount });
      // The audit row comes first: both statements carry the same guard, which is evaluated before the
      // write changes the row, so the two apply together or not at all. Revision 0 guards on "no row":
      // two first saves cannot both insert, and the loser changes nothing.
      const first = write.expectedRevision === 0;
      const audit = db
        .prepare(
          `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
           SELECT ?1, ?2, 'settings', ?3, ?4, ?5
           WHERE ${first ? 'NOT EXISTS (SELECT 1 FROM dashboard_layout WHERE id = 1)' : 'EXISTS (SELECT 1 FROM dashboard_layout WHERE id = 1 AND revision = ?6)'}`
        )
        .bind(
          write.actor,
          AUDIT_ACTION,
          AUDIT_ENTITY_ID,
          write.now,
          details,
          ...(first ? [] : [write.expectedRevision])
        );
      const change = first
        ? db
            .prepare(
              `INSERT INTO dashboard_layout (id, value, revision, updated_at, updated_by)
               SELECT 1, ?1, 1, ?2, ?3 WHERE NOT EXISTS (SELECT 1 FROM dashboard_layout WHERE id = 1)`
            )
            .bind(write.value, write.now, write.actor)
        : db
            .prepare(
              `UPDATE dashboard_layout SET value = ?1, revision = ?4 + 1, updated_at = ?2, updated_by = ?3
               WHERE id = 1 AND revision = ?4`
            )
            .bind(write.value, write.now, write.actor, write.expectedRevision);
      const results = await db.batch([audit, change]);
      return results[1]?.meta.changes === 1 ? 'saved' : 'not_applied';
    }
  };
}
