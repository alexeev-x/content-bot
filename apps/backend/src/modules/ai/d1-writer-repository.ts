import type { WriterFormat, WriterMode } from './writer-types';

export type Provenance = 'AI_DRAFT' | 'OWNER_EDITED' | 'OWNER_APPROVED' | 'OWNER_PREAPPROVED';
export type FeedbackKind = 'joke_missed' | 'not_my_style' | 'fact_wrong';

export interface GenerationRow {
  id: string;
  kind: 'draft' | 'rewrite';
  format: WriterFormat;
  mode: WriterMode;
  source: 'bot' | 'studio';
  task: string;
  parentGenerationId: string | null;
  status: 'pending' | 'ready' | 'failed';
  errorCode: string | null;
  model: string | null;
  hooks: string[];
  warnings: string[];
  preApprovedPublishAt: number | null;
  chatMessageId: number | null;
  createdAt: number;
}

export interface RevisionRow {
  id: string;
  generationId: string;
  provenance: Provenance;
  text: string;
  editRatio: number | null;
  postId: string | null;
  createdAt: number;
}

export interface QualityRows {
  drafts: number;
  rewrites: number;
  failed: number;
  withWarnings: number;
  approved: number;
  approvedUnchanged: number;
  averageEditRatio: number | null;
  jokeMissed: number;
  averageDraftMicroUsd: number | null;
}

/** The chat's mode: talking to the editor, or turning every message into a draft. */
export type ChatMode = 'editor' | 'post';

/** One turn of a /redactor conversation. */
export interface ChatTurn {
  role: 'owner' | 'editor';
  text: string;
}

export interface WriterRepository {
  createGeneration(
    row: Omit<GenerationRow, 'status' | 'errorCode' | 'model' | 'hooks' | 'warnings' | 'chatMessageId'> & {
      packRevision: string;
    }
  ): Promise<void>;
  finishGeneration(input: {
    id: string;
    now: number;
    status: 'ready' | 'failed';
    errorCode?: string;
    model?: string;
    usageId?: string;
    hooks?: string[];
    warnings?: string[];
  }): Promise<void>;
  setChatMessage(id: string, messageId: number, now: number): Promise<void>;
  findGeneration(id: string): Promise<GenerationRow | null>;
  findByChatMessage(messageId: number): Promise<GenerationRow | null>;
  /** The draft's revisions, oldest first (at most 50). */
  revisions(generationId: string): Promise<RevisionRow[]>;
  addRevision(row: Omit<RevisionRow, 'postId'> & { parentId: string | null }): Promise<void>;
  /** The approval of a draft, once; false when it was approved already (a repeated tap or a race). */
  addApproval(row: Omit<RevisionRow, 'postId'> & { parentId: string | null }): Promise<boolean>;
  attachPost(revisionId: string, postId: string): Promise<void>;
  addFeedback(input: { id: string; generationId: string; kind: FeedbackKind; now: number }): Promise<void>;
  recent(limit: number): Promise<GenerationRow[]>;
  /** Counts of the writer's work since `since` (UTC ms), for «Качество». */
  quality(since: number): Promise<QualityRows>;
  /** Opens (or restarts) the chat's mode: the /redactor conversation (empty history) or /post. */
  openRequest(input: {
    chatId: number;
    promptMessageId: number;
    now: number;
    expiresAt: number;
    kind?: ChatMode;
  }): Promise<void>;
  /**
   * The open conversation, its expiry moved to `expiresAt`: the history and the format a button picked for the
   * next message (null: a free message); null when none is open or it expired.
   */
  touchRequest(
    chatId: number,
    now: number,
    expiresAt: number
  ): Promise<{ kind: ChatMode; history: ChatTurn[]; format: WriterFormat | null } | null>;
  /** A format button on the chat's own message (null clears it); false when that chat is gone or replaced. */
  setRequestFormat(input: {
    chatId: number;
    promptMessageId: number | null;
    format: WriterFormat | null;
    now: number;
  }): Promise<boolean>;
  /** Stores the conversation's history (the caller bounds it). */
  saveHistory(chatId: number, history: readonly ChatTurn[]): Promise<void>;
  /** Ends the conversation («Закончить»). */
  closeRequest(chatId: number): Promise<void>;
}

interface RawGeneration {
  id: string;
  kind: 'draft' | 'rewrite';
  format: WriterFormat;
  mode: WriterMode;
  source: 'bot' | 'studio';
  task: string;
  parent_generation_id: string | null;
  status: 'pending' | 'ready' | 'failed';
  error_code: string | null;
  model: string | null;
  hooks: string | null;
  warnings: string | null;
  pre_approved_publish_at: number | null;
  chat_message_id: number | null;
  created_at: number;
}

const GENERATION_COLUMNS =
  'id, kind, format, mode, source, task, parent_generation_id, status, error_code, model, hooks, warnings, pre_approved_publish_at, chat_message_id, created_at';

function list(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function toGeneration(row: RawGeneration): GenerationRow {
  return {
    id: row.id,
    kind: row.kind,
    format: row.format,
    mode: row.mode,
    source: row.source,
    task: row.task,
    parentGenerationId: row.parent_generation_id,
    status: row.status,
    errorCode: row.error_code,
    model: row.model,
    hooks: list(row.hooks),
    warnings: list(row.warnings),
    preApprovedPublishAt: row.pre_approved_publish_at,
    chatMessageId: row.chat_message_id,
    createdAt: row.created_at
  };
}

function parseHistory(raw: string): ChatTurn[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter(
          (turn): turn is ChatTurn =>
            typeof turn === 'object' &&
            turn !== null &&
            ((turn as ChatTurn).role === 'owner' || (turn as ChatTurn).role === 'editor') &&
            typeof (turn as ChatTurn).text === 'string'
        )
      : [];
  } catch {
    return [];
  }
}

export function createD1WriterRepository(db: D1Database): WriterRepository {
  return {
    async createGeneration(row) {
      await db
        .prepare(
          `INSERT INTO ai_generations (id, kind, format, mode, source, task, parent_generation_id, status, pack_revision,
             pre_approved_publish_at, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?9, ?10, ?10)`
        )
        .bind(
          row.id,
          row.kind,
          row.format,
          row.mode,
          row.source,
          row.task,
          row.parentGenerationId,
          row.packRevision,
          row.preApprovedPublishAt,
          row.createdAt
        )
        .run();
    },

    async finishGeneration(input) {
      await db
        .prepare(
          `UPDATE ai_generations SET status = ?2, error_code = ?3, model = COALESCE(?4, model), usage_id = COALESCE(?5, usage_id),
             hooks = COALESCE(?6, hooks), warnings = COALESCE(?7, warnings), updated_at = ?8
           WHERE id = ?1 AND status = 'pending'`
        )
        .bind(
          input.id,
          input.status,
          input.errorCode ?? null,
          input.model ?? null,
          input.usageId ?? null,
          input.hooks === undefined ? null : JSON.stringify(input.hooks),
          input.warnings === undefined ? null : JSON.stringify(input.warnings),
          input.now
        )
        .run();
    },

    async setChatMessage(id, messageId, now) {
      await db
        .prepare('UPDATE ai_generations SET chat_message_id = ?2, updated_at = ?3 WHERE id = ?1')
        .bind(id, messageId, now)
        .run();
    },

    async findGeneration(id) {
      const row = await db
        .prepare(`SELECT ${GENERATION_COLUMNS} FROM ai_generations WHERE id = ?`)
        .bind(id)
        .first<RawGeneration>();
      return row === null ? null : toGeneration(row);
    },

    async findByChatMessage(messageId) {
      const row = await db
        .prepare(
          `SELECT ${GENERATION_COLUMNS} FROM ai_generations WHERE chat_message_id = ? ORDER BY created_at DESC LIMIT 1`
        )
        .bind(messageId)
        .first<RawGeneration>();
      return row === null ? null : toGeneration(row);
    },

    async revisions(generationId) {
      const rows = await db
        .prepare(
          `SELECT id, generation_id AS generationId, provenance, text, edit_ratio AS editRatio, post_id AS postId,
                  created_at AS createdAt
           FROM ai_text_revisions WHERE generation_id = ? ORDER BY created_at, rowid LIMIT 50`
        )
        .bind(generationId)
        .all<RevisionRow>();
      return rows.results;
    },

    async addRevision(row) {
      await db
        .prepare(
          `INSERT INTO ai_text_revisions (id, generation_id, parent_id, provenance, text, edit_ratio, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(row.id, row.generationId, row.parentId, row.provenance, row.text, row.editRatio, row.createdAt)
        .run();
    },

    async addApproval(row) {
      const result = await db
        .prepare(
          `INSERT OR IGNORE INTO ai_text_revisions (id, generation_id, parent_id, provenance, text, edit_ratio, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(row.id, row.generationId, row.parentId, row.provenance, row.text, row.editRatio, row.createdAt)
        .run();
      return result.meta.changes === 1;
    },

    async attachPost(revisionId, postId) {
      await db
        .prepare('UPDATE ai_text_revisions SET post_id = ? WHERE id = ? AND post_id IS NULL')
        .bind(postId, revisionId)
        .run();
    },

    async addFeedback({ id, generationId, kind, now }) {
      await db
        .prepare('INSERT OR IGNORE INTO ai_feedback (id, generation_id, kind, created_at) VALUES (?, ?, ?, ?)')
        .bind(id, generationId, kind, now)
        .run();
    },

    async openRequest({ chatId, promptMessageId, now, expiresAt, kind = 'editor' }) {
      await db
        .prepare(
          `INSERT INTO ai_writer_requests (chat_id, format, prompt_message_id, expires_at, updated_at, history, kind)
           VALUES (?1, NULL, ?2, ?3, ?4, '[]', ?5)
           ON CONFLICT (chat_id) DO UPDATE SET format = NULL, prompt_message_id = ?2, expires_at = ?3, updated_at = ?4,
             history = '[]', kind = ?5`
        )
        .bind(chatId, promptMessageId, expiresAt, now, kind)
        .run();
    },

    async touchRequest(chatId, now, expiresAt) {
      const row = await db
        .prepare(
          `UPDATE ai_writer_requests SET expires_at = ?3, updated_at = ?2
           WHERE chat_id = ?1 AND expires_at > ?2 RETURNING history, format, kind`
        )
        .bind(chatId, now, expiresAt)
        .first<{ history: string; format: WriterFormat | null; kind: ChatMode }>();
      return row === null ? null : { kind: row.kind, history: parseHistory(row.history), format: row.format };
    },

    async setRequestFormat({ chatId, promptMessageId, format, now }) {
      const result = await db
        .prepare(
          `UPDATE ai_writer_requests SET format = ?3, updated_at = ?4
           WHERE chat_id = ?1 AND (?2 IS NULL OR prompt_message_id = ?2) AND expires_at > ?4`
        )
        .bind(chatId, promptMessageId, format, now)
        .run();
      return result.meta.changes === 1;
    },

    async saveHistory(chatId, history) {
      await db
        .prepare('UPDATE ai_writer_requests SET history = ? WHERE chat_id = ?')
        .bind(JSON.stringify(history), chatId)
        .run();
    },

    async closeRequest(chatId) {
      await db.prepare('DELETE FROM ai_writer_requests WHERE chat_id = ?').bind(chatId).run();
    },

    async quality(since) {
      const [generations, approvals, feedback, cost] = await db.batch([
        db
          .prepare(
            `SELECT kind, status, COUNT(*) AS n,
                    SUM(CASE WHEN warnings IS NOT NULL AND warnings <> '[]' THEN 1 ELSE 0 END) AS warned
             FROM ai_generations WHERE created_at >= ? GROUP BY kind, status`
          )
          .bind(since),
        db
          .prepare(
            `SELECT COUNT(*) AS n, SUM(CASE WHEN edit_ratio <= 0.05 THEN 1 ELSE 0 END) AS unchanged,
                    AVG(edit_ratio) AS ratio
             FROM ai_text_revisions
             WHERE provenance IN ('OWNER_APPROVED', 'OWNER_PREAPPROVED') AND created_at >= ?`
          )
          .bind(since),
        db.prepare(`SELECT COUNT(*) AS n FROM ai_feedback WHERE kind = 'joke_missed' AND created_at >= ?`).bind(since),
        db
          .prepare(
            `SELECT AVG(u.cost_micro_usd) AS cost FROM ai_generations g JOIN ai_usage u ON u.id = g.usage_id
             WHERE g.kind = 'draft' AND g.created_at >= ? AND u.cost_micro_usd IS NOT NULL`
          )
          .bind(since)
      ]);
      const rows = (generations?.results ?? []) as { kind: string; status: string; n: number; warned: number | null }[];
      const sum = (match: (row: (typeof rows)[number]) => boolean) =>
        rows.filter(match).reduce((total, row) => total + row.n, 0);
      const approval = approvals?.results[0] as
        { n: number; unchanged: number | null; ratio: number | null } | undefined;
      return {
        drafts: sum((row) => row.kind === 'draft' && row.status === 'ready'),
        rewrites: sum((row) => row.kind === 'rewrite' && row.status === 'ready'),
        failed: sum((row) => row.status === 'failed'),
        withWarnings: rows.reduce((total, row) => total + (row.warned ?? 0), 0),
        approved: approval?.n ?? 0,
        approvedUnchanged: approval?.unchanged ?? 0,
        averageEditRatio: approval?.ratio ?? null,
        jokeMissed: (feedback?.results[0] as { n: number } | undefined)?.n ?? 0,
        averageDraftMicroUsd: (cost?.results[0] as { cost: number | null } | undefined)?.cost ?? null
      };
    },

    async recent(limit) {
      const rows = await db
        .prepare(`SELECT ${GENERATION_COLUMNS} FROM ai_generations ORDER BY created_at DESC LIMIT ?`)
        .bind(Math.min(limit, 50))
        .all<RawGeneration>();
      return rows.results.map(toGeneration);
    }
  };
}
