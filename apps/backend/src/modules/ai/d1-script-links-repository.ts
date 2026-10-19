import type { WriterFormat } from './writer-types';

export type ReelsFormat = Exclude<WriterFormat, 'telegram'>;

export interface ApprovedScriptRow {
  revisionId: string;
  format: ReelsFormat;
  text: string;
  /** When it was approved, UTC ms. */
  approvedAt: number;
}

/** The stored facts of a script's way from the task to the approval, as the database holds them. */
export interface ScriptChainRow {
  task: string;
  model: string | null;
  packRevision: string | null;
  /** The generation's first AI_DRAFT text; null for a generation that has none. */
  draft: string | null;
  approved: string;
  editRatio: number | null;
  /** JSON array of stable codes, as stored. */
  changedParts: string | null;
  draftedAt: number;
  approvedAt: number;
  otherItems: string[];
}

export interface ScriptLinksRepository {
  /** The chain of an approved script, with the other videos linked to it (this one excluded, at most 10). */
  chainOf(input: { revisionId: string; itemId: string }): Promise<ScriptChainRow | null>;
  /** Approved Reels scripts approved at or after `from` that no video is linked to, newest first. */
  unlinkedScripts(input: { from: number; limit: number }): Promise<ApprovedScriptRow[]>;
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
  /** Of `itemIds`, the ones linked to a script (one read; at most 50 ids). */
  linkedAmong(itemIds: readonly string[]): Promise<Set<string>>;
  /** Of `groupKeys`, the prompts that exist, by key (one read; at most 50 keys). */
  promptsAmong(groupKeys: readonly string[]): Promise<Map<string, ScriptPromptRow>>;
  /**
   * A copy of the video collected later on the other platform joins its prompt; when the prompt is linked
   * (`auto` or `linked`), the new items get the same script in the same batch.
   */
  addPromptItems(input: { id: string; itemIds: readonly string[]; now: number }): Promise<void>;
  /** Prompts waiting for the owner or linked by the Worker since `since`, oldest first, at most `limit`. */
  openPrompts(since: number, limit: number): Promise<ScriptPromptRow[]>;
  /**
   * Stores the prompt of one video once (its group key is UNIQUE) and, for an `auto` one, links its items in
   * the same batch; false when the video was handled before.
   */
  createPrompt(input: NewScriptPrompt): Promise<boolean>;
  findPrompt(id: string): Promise<ScriptPromptRow | null>;
  /**
   * Moves a prompt from `from` (and, when given, the candidate on screen) to its new state, linking or unlinking
   * its items in the same batch; false when another tap changed it first.
   */
  answerPrompt(input: {
    id: string;
    from: ScriptPromptStatus;
    shown?: number;
    to: ScriptPromptStatus;
    nextShown?: number;
    revisionId: string | null;
    itemIds: readonly string[];
    link: 'set' | 'remove' | 'keep';
    now: number;
  }): Promise<boolean>;
}

export type ScriptPromptStatus = 'auto' | 'asked' | 'linked' | 'none' | 'undone';

export interface NewScriptPrompt {
  id: string;
  groupKey: string;
  title: string;
  itemIds: string[];
  candidates: string[];
  status: 'auto' | 'asked';
  revisionId: string | null;
  now: number;
}

export interface ScriptPromptRow {
  id: string;
  title: string;
  itemIds: string[];
  candidates: string[];
  shown: number;
  status: ScriptPromptStatus;
  revisionId: string | null;
  createdAt: number;
}

const SCRIPT_COLUMNS = `r.id AS revisionId, g.format, r.text, r.created_at AS approvedAt`;
const PROMPT_COLUMNS =
  'id, title, item_ids AS itemIds, candidates, shown, status, revision_id AS revisionId, created_at AS createdAt';

interface RawPrompt {
  id: string;
  title: string;
  itemIds: string;
  candidates: string;
  shown: number;
  status: ScriptPromptStatus;
  revisionId: string | null;
  createdAt: number;
}

function toPrompt(row: RawPrompt): ScriptPromptRow {
  return {
    id: row.id,
    title: row.title,
    itemIds: JSON.parse(row.itemIds) as string[],
    candidates: JSON.parse(row.candidates) as string[],
    shown: row.shown,
    status: row.status,
    revisionId: row.revisionId,
    createdAt: row.createdAt
  };
}
const APPROVED = `r.provenance IN ('OWNER_APPROVED', 'OWNER_PREAPPROVED') AND g.format <> 'telegram'`;

export function createD1ScriptLinksRepository(db: D1Database): ScriptLinksRepository {
  const repo: ScriptLinksRepository = {
    async chainOf({ revisionId, itemId }) {
      const [script, others] = await db.batch([
        db
          .prepare(
            `SELECT g.task, g.model, g.pack_revision AS packRevision, g.created_at AS draftedAt,
                    r.text AS approved, r.edit_ratio AS editRatio, r.changed_parts AS changedParts,
                    r.created_at AS approvedAt,
                    (SELECT d.text FROM ai_text_revisions d WHERE d.generation_id = g.id AND d.provenance = 'AI_DRAFT'
                     ORDER BY d.created_at, d.rowid LIMIT 1) AS draft
             FROM ai_text_revisions r JOIN ai_generations g ON g.id = r.generation_id
             WHERE r.id = ?1`
          )
          .bind(revisionId),
        db
          .prepare(
            `SELECT content_item_id AS id FROM content_ai_links
             WHERE revision_id = ?1 AND content_item_id <> ?2 ORDER BY linked_at, content_item_id LIMIT 10`
          )
          .bind(revisionId, itemId)
      ]);
      const row = (script?.results as Omit<ScriptChainRow, 'otherItems'>[] | undefined)?.[0];
      if (row === undefined) return null;
      return { ...row, otherItems: ((others?.results ?? []) as { id: string }[]).map((other) => other.id) };
    },

    async unlinkedScripts({ from, limit }) {
      const rows = await db
        .prepare(
          `SELECT ${SCRIPT_COLUMNS} FROM ai_text_revisions r JOIN ai_generations g ON g.id = r.generation_id
           WHERE ${APPROVED} AND r.created_at >= ?1
             AND NOT EXISTS (SELECT 1 FROM content_ai_links l WHERE l.revision_id = r.id)
           ORDER BY r.created_at DESC LIMIT ?2`
        )
        .bind(from, Math.min(limit, 50))
        .all<ApprovedScriptRow>();
      return rows.results;
    },

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
    },

    async linkedAmong(itemIds) {
      const ids = itemIds.slice(0, 50);
      if (ids.length === 0) return new Set();
      const rows = await db
        .prepare(
          'SELECT content_item_id AS id FROM content_ai_links WHERE content_item_id IN (SELECT value FROM json_each(?))'
        )
        .bind(JSON.stringify(ids))
        .all<{ id: string }>();
      return new Set(rows.results.map((row) => row.id));
    },

    async promptsAmong(groupKeys) {
      const keys = groupKeys.slice(0, 50);
      if (keys.length === 0) return new Map();
      const rows = await db
        .prepare(
          `SELECT group_key AS key, ${PROMPT_COLUMNS} FROM ai_script_prompts
           WHERE group_key IN (SELECT value FROM json_each(?))`
        )
        .bind(JSON.stringify(keys))
        .all<RawPrompt & { key: string }>();
      return new Map(rows.results.map((row) => [row.key, toPrompt(row)]));
    },

    async addPromptItems({ id, itemIds, now }) {
      if (itemIds.length === 0) return;
      const linked = "EXISTS (SELECT 1 FROM ai_script_prompts WHERE id = ?3 AND status IN ('auto', 'linked'))";
      await db.batch([
        db
          .prepare(
            `UPDATE ai_script_prompts SET item_ids = (
               SELECT json_group_array(value) FROM (
                 SELECT value FROM json_each(ai_script_prompts.item_ids)
                 UNION SELECT value FROM json_each(?2)
               )
             ), updated_at = ?3 WHERE id = ?1`
          )
          .bind(id, JSON.stringify(itemIds), now),
        ...itemIds.map((itemId) =>
          db
            .prepare(
              `INSERT INTO content_ai_links (content_item_id, revision_id, linked_at)
               SELECT ?1, revision_id, ?2 FROM ai_script_prompts WHERE id = ?3 AND revision_id IS NOT NULL AND ${linked}
               ON CONFLICT (content_item_id) DO NOTHING`
            )
            .bind(itemId, now, id)
        )
      ]);
    },

    async openPrompts(since, limit) {
      const rows = await db
        .prepare(
          `SELECT ${PROMPT_COLUMNS} FROM ai_script_prompts
           WHERE status IN ('auto', 'asked') AND created_at >= ? ORDER BY created_at LIMIT ?`
        )
        .bind(since, Math.min(limit, 10))
        .all<RawPrompt>();
      return rows.results.map(toPrompt);
    },

    async createPrompt({ id, groupKey, title, itemIds, candidates, status, revisionId, now }) {
      const insert = db
        .prepare(
          `INSERT OR IGNORE INTO ai_script_prompts
             (id, group_key, title, item_ids, candidates, status, revision_id, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`
        )
        .bind(id, groupKey, title, JSON.stringify(itemIds), JSON.stringify(candidates), status, revisionId, now);
      // The links only when this insert won: the row with this id exists and is this auto prompt.
      const links =
        status === 'auto' && revisionId !== null
          ? itemIds.map((itemId) =>
              db
                .prepare(
                  `INSERT INTO content_ai_links (content_item_id, revision_id, linked_at)
                   SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM ai_script_prompts WHERE id = ?4 AND status = 'auto')
                   ON CONFLICT (content_item_id) DO NOTHING`
                )
                .bind(itemId, revisionId, now, id)
            )
          : [];
      const [result] = await db.batch([insert, ...links]);
      return result?.meta.changes === 1;
    },

    async findPrompt(id) {
      const row = await db
        .prepare(`SELECT ${PROMPT_COLUMNS} FROM ai_script_prompts WHERE id = ?`)
        .bind(id)
        .first<RawPrompt>();
      return row === null ? null : toPrompt(row);
    },

    async answerPrompt({ id, from, shown, to, nextShown, revisionId, itemIds, link, now }) {
      const update = db
        .prepare(
          `UPDATE ai_script_prompts SET status = ?3, revision_id = ?4, shown = COALESCE(?6, shown), updated_at = ?5
           WHERE id = ?1 AND status = ?2 AND (?7 IS NULL OR shown = ?7)`
        )
        .bind(id, from, to, revisionId, now, nextShown ?? null, shown ?? null);
      // The links follow only the tap that moved the prompt: the row now holds this tap's state and time.
      const moved = 'EXISTS (SELECT 1 FROM ai_script_prompts WHERE id = ?3 AND status = ?4 AND updated_at = ?5)';
      const links = itemIds.map((itemId) =>
        link === 'set'
          ? db
              .prepare(
                `INSERT INTO content_ai_links (content_item_id, revision_id, linked_at) SELECT ?1, ?2, ?5 WHERE ${moved}
                 ON CONFLICT (content_item_id) DO UPDATE SET revision_id = excluded.revision_id, linked_at = excluded.linked_at`
              )
              .bind(itemId, revisionId, id, to, now)
          : db
              .prepare(`DELETE FROM content_ai_links WHERE content_item_id = ?1 AND revision_id = ?2 AND ${moved}`)
              .bind(itemId, revisionId, id, to, now)
      );
      const [result] = await db.batch([update, ...(link === 'keep' ? [] : links)]);
      return result?.meta.changes === 1;
    }
  };
  return repo;
}
