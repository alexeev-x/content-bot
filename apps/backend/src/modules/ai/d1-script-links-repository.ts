import type { WriterFormat } from './writer-types';

export type ReelsFormat = Exclude<WriterFormat, 'telegram'>;

export interface ApprovedScriptRow {
  revisionId: string;
  format: ReelsFormat;
  text: string;
  /** When it was approved, UTC ms. */
  approvedAt: number;
}

export interface ScriptLinksRepository {
  /** Approved Reels scripts approved in [from, to), newest first, at most `limit` (≤ 50). */
  approvedScripts(input: { from: number; to: number; limit: number }): Promise<ApprovedScriptRow[]>;
  /** One approved Reels script; null when the id is not one. */
  findScript(revisionId: string): Promise<ApprovedScriptRow | null>;
  /** The script a video is linked to. */
  linkOf(itemId: string): Promise<ApprovedScriptRow | null>;
  /** Links the video to the script, replacing an earlier link. */
  link(input: { itemId: string; revisionId: string; now: number }): Promise<void>;
  unlink(itemId: string): Promise<void>;
  /** The format of the script a video is linked to. */
  formatOf(itemId: string): Promise<ReelsFormat | null>;
  /** Videos linked to scripts of `format`, at most 500 (a few Reels a week). */
  itemsOf(format: ReelsFormat): Promise<string[]>;
}

const SCRIPT_COLUMNS = `r.id AS revisionId, g.format, r.text, r.created_at AS approvedAt`;
const APPROVED = `r.provenance IN ('OWNER_APPROVED', 'OWNER_PREAPPROVED') AND g.format <> 'telegram'`;

export function createD1ScriptLinksRepository(db: D1Database): ScriptLinksRepository {
  const repo: ScriptLinksRepository = {
    async approvedScripts({ from, to, limit }) {
      const rows = await db
        .prepare(
          `SELECT ${SCRIPT_COLUMNS} FROM ai_text_revisions r JOIN ai_generations g ON g.id = r.generation_id
           WHERE ${APPROVED} AND r.created_at >= ?1 AND r.created_at < ?2
           ORDER BY r.created_at DESC LIMIT ?3`
        )
        .bind(from, to, Math.min(limit, 50))
        .all<ApprovedScriptRow>();
      return rows.results;
    },

    async findScript(revisionId) {
      return db
        .prepare(
          `SELECT ${SCRIPT_COLUMNS} FROM ai_text_revisions r JOIN ai_generations g ON g.id = r.generation_id
           WHERE r.id = ?1 AND ${APPROVED}`
        )
        .bind(revisionId)
        .first<ApprovedScriptRow>();
    },

    async linkOf(itemId) {
      return db
        .prepare(
          `SELECT ${SCRIPT_COLUMNS} FROM content_ai_links l
           JOIN ai_text_revisions r ON r.id = l.revision_id JOIN ai_generations g ON g.id = r.generation_id
           WHERE l.content_item_id = ?1`
        )
        .bind(itemId)
        .first<ApprovedScriptRow>();
    },

    async link({ itemId, revisionId, now }) {
      await db
        .prepare(
          `INSERT INTO content_ai_links (content_item_id, revision_id, linked_at) VALUES (?1, ?2, ?3)
           ON CONFLICT (content_item_id) DO UPDATE SET revision_id = excluded.revision_id, linked_at = excluded.linked_at`
        )
        .bind(itemId, revisionId, now)
        .run();
    },

    async unlink(itemId) {
      await db.prepare('DELETE FROM content_ai_links WHERE content_item_id = ?1').bind(itemId).run();
    },

    async formatOf(itemId) {
      return (await repo.linkOf(itemId))?.format ?? null;
    },

    async itemsOf(format) {
      const rows = await db
        .prepare(
          `SELECT l.content_item_id AS id FROM content_ai_links l
           JOIN ai_text_revisions r ON r.id = l.revision_id JOIN ai_generations g ON g.id = r.generation_id
           WHERE g.format = ?1 LIMIT 500`
        )
        .bind(format)
        .all<{ id: string }>();
      return rows.results.map((row) => row.id);
    }
  };
  return repo;
}
