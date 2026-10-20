import { AppError } from '../../shared/app-error';
import { type ContentRubricRepository, rubricKey, type RubricRow, type TelegramItemRow } from './rubrics';

/** A taken name or tag is the owner's input, not a server fault: the UNIQUE constraint names the column. */
function conflictOf(error: unknown): AppError | null {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('content_rubrics.name'))
    return new AppError('CONFLICT', 'Rubric name taken', { reason: 'NAME_TAKEN' });
  if (message.includes('content_rubrics.tag'))
    return new AppError('CONFLICT', 'Rubric tag taken', { reason: 'TAG_TAKEN' });
  return null;
}

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw conflictOf(error) ?? error;
  }
}

export function createD1ContentRubricRepository(db: D1Database): ContentRubricRepository {
  return {
    async list() {
      const rows = await db
        .prepare('SELECT id, name, tag FROM content_rubrics ORDER BY name COLLATE NOCASE, id LIMIT 50')
        .all<RubricRow>();
      return rows.results;
    },

    async create({ id, name, tag, now, max }) {
      // One conditional statement: two quick adds cannot pass the limit together.
      const result = await guarded(() =>
        db
          .prepare(
            `INSERT INTO content_rubrics (id, name, name_key, tag, created_at)
             SELECT ?1, ?2, ?6, ?3, ?4 WHERE (SELECT COUNT(*) FROM content_rubrics) < ?5`
          )
          .bind(id, name, tag, now, max, rubricKey(name))
          .run()
      );
      return result.meta.changes === 1;
    },

    async update({ id, name, tag }) {
      const result = await guarded(() =>
        db
          .prepare('UPDATE content_rubrics SET name = ?2, name_key = ?4, tag = ?3 WHERE id = ?1')
          .bind(id, name, tag, rubricKey(name))
          .run()
      );
      return result.meta.changes === 1;
    },

    async remove(id) {
      await db.prepare('DELETE FROM content_rubrics WHERE id = ?').bind(id).run();
    },

    async postRubric(postId) {
      const row = await db
        .prepare('SELECT rubric_id AS rubricId FROM content_post_rubrics WHERE post_id = ?')
        .bind(postId)
        .first<{ rubricId: string }>();
      return row?.rubricId ?? null;
    },

    async setPostRubric({ postId, rubricId, now }) {
      if (rubricId === null) {
        await db.prepare('DELETE FROM content_post_rubrics WHERE post_id = ?').bind(postId).run();
        return;
      }
      try {
        await db
          .prepare(
            `INSERT INTO content_post_rubrics (post_id, rubric_id, set_at) VALUES (?1, ?2, ?3)
             ON CONFLICT (post_id) DO UPDATE SET rubric_id = ?2,
               set_at = CASE WHEN content_post_rubrics.rubric_id = ?2 THEN content_post_rubrics.set_at ELSE ?3 END`
          )
          .bind(postId, rubricId, now)
          .run();
      } catch (error) {
        if (error instanceof Error && error.message.includes('FOREIGN KEY'))
          throw new AppError('NOT_FOUND', 'Post or rubric not found');
        throw error;
      }
    },

    async postRubrics(postIds) {
      const ids = postIds.slice(0, 100);
      if (ids.length === 0) return new Map();
      const rows = await db
        .prepare(
          `SELECT post_id AS postId, rubric_id AS rubricId FROM content_post_rubrics
           WHERE post_id IN (SELECT value FROM json_each(?))`
        )
        .bind(JSON.stringify(ids))
        .all<{ postId: string; rubricId: string }>();
      return new Map(rows.results.map((row) => [row.postId, row.rubricId]));
    },

    async telegramItems(from, limit) {
      const rows = await db
        .prepare(
          `SELECT id, title, tags FROM content_items
           WHERE platform = 'telegram' AND published_at >= ? ORDER BY published_at DESC LIMIT ?`
        )
        .bind(from, limit)
        .all<TelegramItemRow>();
      return rows.results;
    }
  };
}
