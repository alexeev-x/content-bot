import type { ActivityRepository, ActivityRow } from '../application/ports';

// A read model over the audit log: titles are looked up at read time, so a renamed post shows its current name
// and a deleted object shows none. Newest first by (created_at, id), served by audit_log_created_idx.
const SELECT = `
  SELECT a.id, a.created_at AS at, a.action, a.actor_telegram_id AS actor, a.entity_type AS entityType,
         a.entity_id AS entityId, a.details,
         CASE a.entity_type
           WHEN 'post' THEN (SELECT p.title FROM posts p WHERE p.id = a.entity_id)
           WHEN 'media' THEN (SELECT m.file_name FROM media_assets m WHERE m.id = a.entity_id)
           WHEN 'publication' THEN (SELECT p.title FROM publications pu JOIN posts p ON p.id = pu.post_id
                                    WHERE pu.id = a.entity_id)
           WHEN 'destination' THEN (SELECT d.title FROM destinations d WHERE d.id = a.entity_id)
           ELSE NULL END AS title,
         CASE a.entity_type
           WHEN 'post' THEN (SELECT p.id FROM posts p WHERE p.id = a.entity_id AND p.deleted_at IS NULL)
           WHEN 'publication' THEN (SELECT p.id FROM publications pu JOIN posts p ON p.id = pu.post_id
                                    WHERE pu.id = a.entity_id AND p.deleted_at IS NULL)
           ELSE NULL END AS postId,
         CASE a.entity_type WHEN 'publication' THEN (SELECT pu.id FROM publications pu WHERE pu.id = a.entity_id)
           ELSE NULL END AS publicationId,
         CASE a.entity_type WHEN 'publication' THEN (SELECT d.title FROM publications pu
                                                     JOIN destinations d ON d.id = pu.destination_id
                                                     WHERE pu.id = a.entity_id)
           ELSE NULL END AS channelTitle
  FROM audit_log a`;

export function createD1ActivityRepository(db: D1Database): ActivityRepository {
  return {
    async list({ actions, from, to, before, limit }) {
      const bindings: (string | number)[] = [];
      const bind = (value: string | number) => {
        bindings.push(value);
        return `?${bindings.length}`;
      };
      const conditions = [`a.action IN (${actions.map((action) => bind(action)).join(', ')})`];
      if (from !== undefined) conditions.push(`a.created_at >= ${bind(from)}`);
      if (to !== undefined) conditions.push(`a.created_at < ${bind(to)}`);
      if (before !== undefined) {
        const at = bind(before.at);
        conditions.push(`(a.created_at < ${at} OR (a.created_at = ${at} AND a.id < ${bind(before.id)}))`);
      }
      const sql = `${SELECT} WHERE ${conditions.join(' AND ')} ORDER BY a.created_at DESC, a.id DESC LIMIT ${bind(limit)}`;
      const { results } = await db
        .prepare(sql)
        .bind(...bindings)
        .all<ActivityRow>();
      return results;
    }
  };
}
