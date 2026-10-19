import type { AiFeedbackKind } from '@alexeev/contracts';
import { WRITER_FORMATS, type WriterFormat, type WriterMode } from './writer-types';

export type Provenance = 'AI_DRAFT' | 'OWNER_EDITED' | 'OWNER_APPROVED' | 'OWNER_PREAPPROVED';
/** The owner's verdicts on a draft (migration 0067). */
export type FeedbackKind = AiFeedbackKind;

export interface FeedbackRow {
  id: string;
  kind: FeedbackKind;
  format: WriterFormat;
  task: string;
  text: string | null;
  /** The owner's own words on the verdict (migration 0071). */
  note: string | null;
  createdAt: number;
}

/** An approved AI text the owner changed, as a candidate for the writer's examples. */
export interface LearningRevisionRow {
  id: string;
  format: WriterFormat;
  text: string;
  editRatio: number;
  changedParts: string[];
  excluded: boolean;
  createdAt: number;
}

// The «unchanged» line of «Качество» (≤ 5% edited): below it an approval is the model's words, not the owner's.
const OWNER_EXAMPLE_MIN_EDIT = 0.05;
/** Candidates the writer ranks by relevance to the task; the prompt still gets at most two. */
const OWNER_EXAMPLE_CANDIDATES = 20;
/** Most revisions «Чему учится ИИ» lists. */
const LEARNING_REVISIONS_MAX = 40;
/** What counts as the owner's confirmed words: an approved text he changed, without a «Что не так?» verdict. */
const LEARNING_REVISION = `r.provenance IN ('OWNER_APPROVED', 'OWNER_PREAPPROVED') AND r.edit_ratio > ?1
  AND NOT EXISTS (SELECT 1 FROM ai_feedback f WHERE f.generation_id = r.generation_id)`;
const EXCLUDED_REVISION = `EXISTS (SELECT 1 FROM ai_learning_exclusions x WHERE x.source = 'revision' AND x.source_id = r.id)`;

interface RawLearningRevision {
  id: string;
  format: WriterFormat;
  text: string;
  editRatio: number;
  changedParts: string | null;
  excluded: number;
  createdAt: number;
}

function toLearningRevision(row: RawLearningRevision): LearningRevisionRow {
  return { ...row, changedParts: list(row.changedParts), excluded: row.excluded === 1 };
}

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
  /** What the model answered (migration 0062): a draft or a request for facts; null on older rows and while pending. */
  result: 'draft' | 'needs_facts' | null;
  /** The model's question to the owner (needs_facts). */
  question: string | null;
  /** Topic ideas offered with the question (needs_facts). */
  ideas: string[];
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
  /** Ready drafts and rewrites that hold a text; a request for facts is counted in `questions` instead. */
  drafts: number;
  rewrites: number;
  /** Ready answers that asked the owner for facts (needs_facts, migration 0062): no text to approve. */
  questions: number;
  /** Drafts written from the studio (control runs): they cannot be approved, so they stay out of every share. */
  studioDrafts: number;
  failed: number;
  withWarnings: number;
  approved: number;
  approvedUnchanged: number;
  averageEditRatio: number | null;
  jokeMissed: number;
  /** The owner's verdicts by reason, most given first. */
  feedback: { kind: FeedbackKind; count: number }[];
  averageDraftMicroUsd: number | null;
  /** Approvals tagged with changed parts (migration 0061) and how many of them changed each part. */
  tagged: number;
  changedParts: { part: string; count: number }[];
  /** Every writer format over the same period (the bot's drafts only), zeros included. */
  byFormat: FormatQualityRow[];
}

export interface FormatQualityRow {
  format: WriterFormat;
  drafts: number;
  questions: number;
  approved: number;
  approvedUnchanged: number;
  averageEditRatio: number | null;
  /** Shares over tagged approvals; null without any. */
  hookChangedShare: number | null;
  endingChangedShare: number | null;
  jokeMissed: number;
  medianMinutesToApproval: number | null;
}

/** Approvals of a period, for the comparison with the one before it. */
export interface PeriodApprovals {
  approved: number;
  averageEditRatio: number | null;
}

/** Most approvals read to find the median time to approval: bounds the work and the rows. */
const MEDIAN_ROWS = 500;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const high = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? high : ((sorted[middle - 1] ?? 0) + high) / 2;
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
    row: Omit<
      GenerationRow,
      'status' | 'errorCode' | 'model' | 'hooks' | 'warnings' | 'chatMessageId' | 'result' | 'question' | 'ideas'
    > & {
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
    result?: 'draft' | 'needs_facts';
    question?: string;
    ideas?: string[];
    facets?: { topic: string; device: string; ending: string };
  }): Promise<void>;
  /** Topic, comic device and ending of the latest drafts of every format, newest first (at most 30). */
  recentFacets(limit: number): Promise<{ format: WriterFormat; topic: string; device: string; ending: string }[]>;
  /** The AI texts of the latest drafts (at most 10), to count signature phrases; never voice examples. */
  recentDraftTexts(limit: number): Promise<string[]>;
  setChatMessage(id: string, messageId: number, now: number): Promise<void>;
  findGeneration(id: string): Promise<GenerationRow | null>;
  findByChatMessage(messageId: number): Promise<GenerationRow | null>;
  /** The draft's revisions, oldest first (at most 50). */
  revisions(generationId: string): Promise<RevisionRow[]>;
  addRevision(row: Omit<RevisionRow, 'postId'> & { parentId: string | null }): Promise<boolean>;
  /** The approval of a draft, once; false when it was approved already (a repeated tap or a race). */
  addApproval(
    row: Omit<RevisionRow, 'postId'> & { parentId: string | null; changedParts: readonly string[] }
  ): Promise<boolean>;
  attachPost(revisionId: string, postId: string): Promise<void>;
  /** The newest verdicts with the draft's format and task and the judged text, at most `limit` (≤ 30). */
  listFeedback(limit: number): Promise<FeedbackRow[]>;
  deleteFeedback(id: string): Promise<void>;
  /** Once per draft and kind: a repeated tap records nothing new. */
  addFeedback(input: {
    id: string;
    generationId: string;
    kind: FeedbackKind;
    revisionId: string | null;
    now: number;
  }): Promise<string>;
  /** Stores the owner's note on a verdict; false when the verdict is gone. */
  setFeedbackNote(id: string, note: string): Promise<boolean>;
  recent(limit: number): Promise<GenerationRow[]>;
  /**
   * The owner's approved texts of one format that the owner actually changed (edit ratio > 5%), newest first:
   * style examples for the next draft. An AI_DRAFT, or an approval of the model's words unchanged, never is one.
   */
  ownerExamples(input: { format: WriterFormat; limit: number }): Promise<{ text: string; createdAt: number }[]>;
  /** Approved texts the owner changed, newest first, with the owner's exclusion (any format; at most 40). */
  learningRevisions(limit: number): Promise<LearningRevisionRow[]>;
  /** One such text; null when it is not eligible (not approved, not changed, or disliked). */
  findLearningRevision(id: string): Promise<LearningRevisionRow | null>;
  /** The excluded ones among these post ids (at most 100). */
  excludedPosts(ids: readonly string[]): Promise<Set<string>>;
  /** Takes a text out of the writer's examples, or brings it back; repeating is a no-op. */
  setExcluded(input: { source: 'revision' | 'post'; id: string; excluded: boolean; now: number }): Promise<void>;
  /** Which of these posts (at most 100) came from an approved AI draft: where it was written and how much was edited. */
  postOrigins(
    postIds: readonly string[]
  ): Promise<{ postId: string; source: 'bot' | 'studio'; editRatio: number | null }[]>;
  /** Counts of the writer's work since `since` (UTC ms), for «Качество». */
  quality(since: number): Promise<QualityRows>;
  /** Approvals in [from, to): the period right before «Качество», compared with it. */
  periodApprovals(from: number, to: number): Promise<PeriodApprovals>;
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
  ): Promise<{
    kind: ChatMode;
    history: ChatTurn[];
    format: WriterFormat | null;
    editing: string | null;
    noting: string | null;
  } | null>;
  /**
   * «✏️ Изменить»: the chat waits for the owner's version of `generationId` (null stops waiting). Opens the
   * chat row when none is open, so the next plain message is the edit whatever mode the chat is in.
   */
  setEditing(input: { chatId: number; generationId: string | null; now: number; expiresAt: number }): Promise<void>;
  /** Consumes one awaited edit/question; a concurrent reply to the same generation loses without a model call. */
  consumeEditing(input: { chatId: number; generationId: string; now: number }): Promise<boolean>;
  /** Saves the owner's facts and consumes the matching wait in one D1 batch; only the first answer wins. */
  claimFactAnswer(input: { chatId: number; generationId: string; answer: string; now: number }): Promise<boolean>;
  /** A failed facts generation can be retried by an explicit owner tap, never by a background retry. */
  claimFactRetry(input: { chatId: number; generationId: string; now: number }): Promise<string | null>;
  /** Existing draft to show again when Telegram delivery failed after the model result was saved. */
  readyFactDraft(input: { chatId: number; generationId: string }): Promise<string | null>;
  finishFactAnswer(input: {
    generationId: string;
    draftGenerationId: string | null;
    status: 'failed' | 'ready';
    now: number;
  }): Promise<void>;
  /**
   * After a «Что не так?» reason: the chat waits for the owner's note on `feedbackId` (null stops waiting). Like
   * `setEditing`, it opens a row of its own when no chat is open; starting it ends an awaited edit, so one wait is
   * open at a time.
   */
  setNoting(input: { chatId: number; feedbackId: string | null; now: number; expiresAt: number }): Promise<void>;
  /** A cancel button may clear only the note wait it created. */
  cancelNoting(input: { chatId: number; feedbackId: string }): Promise<boolean>;
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
  result: 'draft' | 'needs_facts' | null;
  question: string | null;
  ideas: string | null;
}

const GENERATION_COLUMNS =
  'id, kind, format, mode, source, task, parent_generation_id, status, error_code, model, hooks, warnings, pre_approved_publish_at, chat_message_id, created_at, result, question, ideas';

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
    createdAt: row.created_at,
    result: row.result,
    question: row.question,
    ideas: list(row.ideas)
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
             hooks = COALESCE(?6, hooks), warnings = COALESCE(?7, warnings), updated_at = ?8,
             result = COALESCE(?9, result), question = COALESCE(?10, question), ideas = COALESCE(?11, ideas),
             facets = COALESCE(?12, facets)
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
          input.now,
          input.result ?? null,
          input.question ?? null,
          input.ideas === undefined ? null : JSON.stringify(input.ideas),
          input.facets === undefined ? null : JSON.stringify(input.facets)
        )
        .run();
    },

    async recentFacets(limit) {
      // Every format: the same idea in a post and in a Reels is a repeat for the viewer too.
      const rows = await db
        .prepare(
          `SELECT format, facets FROM ai_generations WHERE result = 'draft' AND facets IS NOT NULL
           ORDER BY created_at DESC LIMIT ?1`
        )
        .bind(Math.min(limit, 30))
        .all<{ format: WriterFormat; facets: string }>();
      return rows.results.flatMap((row) => {
        try {
          const value = JSON.parse(row.facets) as Partial<Record<'topic' | 'device' | 'ending', unknown>>;
          return typeof value.topic === 'string'
            ? [
                {
                  format: row.format,
                  topic: value.topic,
                  device: typeof value.device === 'string' ? value.device : '',
                  ending: typeof value.ending === 'string' ? value.ending : ''
                }
              ]
            : [];
        } catch {
          return [];
        }
      });
    },

    async recentDraftTexts(limit) {
      // Only to count the author's signature phrases (how often, not how to write): never a voice example.
      const rows = await db
        .prepare(
          `SELECT r.text FROM ai_generations g JOIN ai_text_revisions r ON r.generation_id = g.id
           WHERE g.result = 'draft' AND r.provenance = 'AI_DRAFT'
           ORDER BY g.created_at DESC LIMIT ?1`
        )
        .bind(Math.min(limit, 10))
        .all<{ text: string }>();
      return rows.results.map((row) => row.text);
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
      const result = await db
        .prepare(
          `INSERT INTO ai_text_revisions (id, generation_id, parent_id, provenance, text, edit_ratio, created_at)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
           WHERE NOT EXISTS (
             SELECT 1 FROM ai_text_revisions
             WHERE generation_id = ?2 AND provenance IN ('OWNER_APPROVED', 'OWNER_PREAPPROVED')
           ) AND ?3 IS (
             SELECT id FROM ai_text_revisions WHERE generation_id = ?2 ORDER BY created_at DESC, rowid DESC LIMIT 1
           )`
        )
        .bind(row.id, row.generationId, row.parentId, row.provenance, row.text, row.editRatio, row.createdAt)
        .run();
      return result.meta.changes === 1;
    },

    async addApproval(row) {
      const result = await db
        .prepare(
          `INSERT OR IGNORE INTO ai_text_revisions
             (id, generation_id, parent_id, provenance, text, edit_ratio, changed_parts, created_at)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
           WHERE ?3 = (
             SELECT id FROM ai_text_revisions WHERE generation_id = ?2 ORDER BY created_at DESC, rowid DESC LIMIT 1
           )`
        )
        .bind(
          row.id,
          row.generationId,
          row.parentId,
          row.provenance,
          row.text,
          row.editRatio,
          JSON.stringify(row.changedParts),
          row.createdAt
        )
        .run();
      return result.meta.changes === 1;
    },

    async attachPost(revisionId, postId) {
      await db
        .prepare('UPDATE ai_text_revisions SET post_id = ? WHERE id = ? AND post_id IS NULL')
        .bind(postId, revisionId)
        .run();
    },

    async listFeedback(limit) {
      const rows = await db
        .prepare(
          `SELECT f.id, f.kind, g.format, g.task, r.text, f.note, f.created_at AS createdAt
           FROM ai_feedback f JOIN ai_generations g ON g.id = f.generation_id
           LEFT JOIN ai_text_revisions r ON r.id = f.revision_id
           ORDER BY f.created_at DESC, f.id LIMIT ?`
        )
        .bind(Math.min(limit, 30))
        .all<FeedbackRow>();
      return rows.results;
    },

    async deleteFeedback(id) {
      await db.prepare('DELETE FROM ai_feedback WHERE id = ?').bind(id).run();
    },

    async addFeedback({ id, generationId, kind, revisionId, now }) {
      const [, row] = await db.batch([
        db
          .prepare(
            'INSERT OR IGNORE INTO ai_feedback (id, generation_id, kind, revision_id, created_at) VALUES (?, ?, ?, ?, ?)'
          )
          .bind(id, generationId, kind, revisionId, now),
        db.prepare('SELECT id FROM ai_feedback WHERE generation_id = ? AND kind = ?').bind(generationId, kind)
      ]);
      // A repeated tap finds the verdict recorded first: its note is the one to ask for.
      return (row?.results[0] as { id: string } | undefined)?.id ?? id;
    },

    async setFeedbackNote(id, note) {
      const result = await db.prepare('UPDATE ai_feedback SET note = ? WHERE id = ?').bind(note, id).run();
      return result.meta.changes === 1;
    },

    async openRequest({ chatId, promptMessageId, now, expiresAt, kind = 'editor' }) {
      await db
        .prepare(
          `INSERT INTO ai_writer_requests (chat_id, format, prompt_message_id, expires_at, updated_at, history, kind)
           VALUES (?1, NULL, ?2, ?3, ?4, '[]', ?5)
           ON CONFLICT (chat_id) DO UPDATE SET format = NULL, prompt_message_id = ?2, expires_at = ?3, updated_at = ?4,
             history = '[]', kind = ?5, editing_generation_id = NULL, noting_feedback_id = NULL`
        )
        .bind(chatId, promptMessageId, expiresAt, now, kind)
        .run();
    },

    async touchRequest(chatId, now, expiresAt) {
      const row = await db
        .prepare(
          `UPDATE ai_writer_requests SET expires_at = ?3, updated_at = ?2
           WHERE chat_id = ?1 AND expires_at > ?2 RETURNING history, format, kind, editing_generation_id AS editing,
             noting_feedback_id AS noting`
        )
        .bind(chatId, now, expiresAt)
        .first<{
          history: string;
          format: WriterFormat | null;
          kind: ChatMode;
          editing: string | null;
          noting: string | null;
        }>();
      return row === null
        ? null
        : {
            kind: row.kind,
            history: parseHistory(row.history),
            format: row.format,
            editing: row.editing,
            noting: row.noting
          };
    },

    async setEditing({ chatId, generationId, now, expiresAt }) {
      if (generationId === null) {
        // Stop waiting. A row made only for the wait (prompt_message_id 0) goes with it, so an edit never leaves
        // a /redactor chat open behind it (a paid model call for the next «привет»).
        await db.batch([
          db.prepare('UPDATE ai_writer_requests SET editing_generation_id = NULL WHERE chat_id = ?').bind(chatId),
          db
            .prepare(
              'DELETE FROM ai_writer_requests WHERE chat_id = ? AND prompt_message_id = 0 AND noting_feedback_id IS NULL'
            )
            .bind(chatId)
        ]);
        return;
      }
      // A live chat keeps its mode, history and buttons; without one (or an expired one) the row exists only for
      // the wait: prompt_message_id 0 matches no format button, and it is removed once the edit arrives.
      await db
        .prepare(
          `INSERT INTO ai_writer_requests
             (chat_id, format, prompt_message_id, expires_at, updated_at, history, kind, editing_generation_id)
           VALUES (?1, NULL, 0, ?3, ?4, '[]', 'editor', ?2)
           ON CONFLICT (chat_id) DO UPDATE SET editing_generation_id = ?2, noting_feedback_id = NULL,
             expires_at = ?3, updated_at = ?4,
             history = CASE WHEN ai_writer_requests.expires_at > ?4 THEN ai_writer_requests.history ELSE '[]' END,
             kind = CASE WHEN ai_writer_requests.expires_at > ?4 THEN ai_writer_requests.kind ELSE 'editor' END,
             format = CASE WHEN ai_writer_requests.expires_at > ?4 THEN ai_writer_requests.format ELSE NULL END,
             prompt_message_id = CASE WHEN ai_writer_requests.expires_at > ?4
               THEN ai_writer_requests.prompt_message_id ELSE 0 END`
        )
        .bind(chatId, generationId, expiresAt, now)
        .run();
    },

    async consumeEditing({ chatId, generationId, now }) {
      const result = await db
        .prepare(
          `UPDATE ai_writer_requests SET editing_generation_id = NULL
           WHERE chat_id = ? AND editing_generation_id = ? AND expires_at > ?`
        )
        .bind(chatId, generationId, now)
        .run();
      if (result.meta.changes !== 1) return false;
      await db
        .prepare(
          'DELETE FROM ai_writer_requests WHERE chat_id = ? AND prompt_message_id = 0 AND editing_generation_id IS NULL AND noting_feedback_id IS NULL'
        )
        .bind(chatId)
        .run();
      return true;
    },

    async claimFactAnswer({ chatId, generationId, answer, now }) {
      const [claim] = await db.batch([
        db
          .prepare(
            `INSERT OR IGNORE INTO ai_writer_fact_answers
               (question_generation_id, chat_id, answer, status, claimed_at, updated_at)
             SELECT ?2, ?1, ?3, 'processing', ?4, ?4
             WHERE EXISTS (
               SELECT 1 FROM ai_writer_requests
               WHERE chat_id = ?1 AND editing_generation_id = ?2 AND expires_at > ?4
             )`
          )
          .bind(chatId, generationId, answer, now),
        db
          .prepare(
            `UPDATE ai_writer_requests SET editing_generation_id = NULL
             WHERE chat_id = ?1 AND editing_generation_id = ?2
               AND EXISTS (SELECT 1 FROM ai_writer_fact_answers WHERE question_generation_id = ?2)`
          )
          .bind(chatId, generationId),
        db
          .prepare(
            `DELETE FROM ai_writer_requests
             WHERE chat_id = ? AND prompt_message_id = 0 AND editing_generation_id IS NULL AND noting_feedback_id IS NULL`
          )
          .bind(chatId)
      ]);
      return claim?.meta.changes === 1;
    },

    async claimFactRetry({ chatId, generationId, now }) {
      const row = await db
        .prepare(
          `UPDATE ai_writer_fact_answers SET status = 'processing', claimed_at = ?3, updated_at = ?3
           WHERE chat_id = ?1 AND question_generation_id = ?2
             AND (status = 'failed' OR (status = 'processing' AND claimed_at <= ?3 - 60000))
           RETURNING answer`
        )
        .bind(chatId, generationId, now)
        .first<{ answer: string }>();
      return row?.answer ?? null;
    },

    async readyFactDraft({ chatId, generationId }) {
      const row = await db
        .prepare(
          `SELECT draft_generation_id AS draftGenerationId FROM ai_writer_fact_answers
           WHERE chat_id = ? AND question_generation_id = ? AND status = 'ready'`
        )
        .bind(chatId, generationId)
        .first<{ draftGenerationId: string | null }>();
      return row?.draftGenerationId ?? null;
    },

    async finishFactAnswer({ generationId, draftGenerationId, status, now }) {
      await db
        .prepare(
          `UPDATE ai_writer_fact_answers SET status = ?2, draft_generation_id = ?3, updated_at = ?4
           WHERE question_generation_id = ?1 AND status = 'processing'`
        )
        .bind(generationId, status, draftGenerationId, now)
        .run();
    },

    async setNoting({ chatId, feedbackId, now, expiresAt }) {
      if (feedbackId === null) {
        // Same as `setEditing(null)`: a row made only for the wait goes with it, unless an edit is awaited on it.
        await db.batch([
          db.prepare('UPDATE ai_writer_requests SET noting_feedback_id = NULL WHERE chat_id = ?').bind(chatId),
          db
            .prepare(
              'DELETE FROM ai_writer_requests WHERE chat_id = ? AND prompt_message_id = 0 AND editing_generation_id IS NULL'
            )
            .bind(chatId)
        ]);
        return;
      }
      await db
        .prepare(
          `INSERT INTO ai_writer_requests
             (chat_id, format, prompt_message_id, expires_at, updated_at, history, kind, noting_feedback_id)
           VALUES (?1, NULL, 0, ?3, ?4, '[]', 'editor', ?2)
           ON CONFLICT (chat_id) DO UPDATE SET noting_feedback_id = ?2, editing_generation_id = NULL,
             expires_at = ?3, updated_at = ?4,
             history = CASE WHEN ai_writer_requests.expires_at > ?4 THEN ai_writer_requests.history ELSE '[]' END,
             kind = CASE WHEN ai_writer_requests.expires_at > ?4 THEN ai_writer_requests.kind ELSE 'editor' END,
             format = CASE WHEN ai_writer_requests.expires_at > ?4 THEN ai_writer_requests.format ELSE NULL END,
             prompt_message_id = CASE WHEN ai_writer_requests.expires_at > ?4
               THEN ai_writer_requests.prompt_message_id ELSE 0 END`
        )
        .bind(chatId, feedbackId, expiresAt, now)
        .run();
    },

    async cancelNoting({ chatId, feedbackId }) {
      const result = await db
        .prepare('UPDATE ai_writer_requests SET noting_feedback_id = NULL WHERE chat_id = ? AND noting_feedback_id = ?')
        .bind(chatId, feedbackId)
        .run();
      if (result.meta.changes !== 1) return false;
      await db
        .prepare(
          'DELETE FROM ai_writer_requests WHERE chat_id = ? AND prompt_message_id = 0 AND editing_generation_id IS NULL AND noting_feedback_id IS NULL'
        )
        .bind(chatId)
        .run();
      return true;
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
      const [generations, approvals, feedback, cost, tagged, parts, formatApprovals, formatJokes, approvalTimes] =
        await db.batch([
          db
            .prepare(
              `SELECT format, kind, status, result, source, COUNT(*) AS n,
                    SUM(CASE WHEN warnings IS NOT NULL AND warnings <> '[]' THEN 1 ELSE 0 END) AS warned
             FROM ai_generations WHERE created_at >= ? GROUP BY format, kind, status, result, source`
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
          db
            .prepare(
              `SELECT kind, COUNT(*) AS n FROM ai_feedback WHERE created_at >= ? GROUP BY kind ORDER BY n DESC, kind`
            )
            .bind(since),
          db
            .prepare(
              `SELECT AVG(u.cost_micro_usd) AS cost FROM ai_generations g JOIN ai_usage u ON u.id = g.usage_id
             WHERE g.kind = 'draft' AND g.created_at >= ? AND u.cost_micro_usd IS NOT NULL`
            )
            .bind(since),
          db
            .prepare(
              `SELECT COUNT(*) AS n FROM ai_text_revisions
             WHERE provenance IN ('OWNER_APPROVED', 'OWNER_PREAPPROVED') AND created_at >= ? AND changed_parts IS NOT NULL`
            )
            .bind(since),
          db
            .prepare(
              `SELECT j.value AS part, COUNT(*) AS n FROM ai_text_revisions r, json_each(r.changed_parts) j
             WHERE r.provenance IN ('OWNER_APPROVED', 'OWNER_PREAPPROVED') AND r.created_at >= ?
               AND r.changed_parts IS NOT NULL
             GROUP BY j.value`
            )
            .bind(since),
          db
            .prepare(
              `SELECT g.format AS format, COUNT(*) AS n, SUM(CASE WHEN r.edit_ratio <= 0.05 THEN 1 ELSE 0 END) AS unchanged,
                    AVG(r.edit_ratio) AS ratio,
                    SUM(CASE WHEN r.changed_parts IS NOT NULL THEN 1 ELSE 0 END) AS tagged,
                    SUM(CASE WHEN r.changed_parts IS NOT NULL
                              AND EXISTS (SELECT 1 FROM json_each(r.changed_parts) WHERE value = 'hook') THEN 1 ELSE 0 END) AS hook,
                    SUM(CASE WHEN r.changed_parts IS NOT NULL
                              AND EXISTS (SELECT 1 FROM json_each(r.changed_parts) WHERE value = 'ending') THEN 1 ELSE 0 END) AS ending
             FROM ai_text_revisions r JOIN ai_generations g ON g.id = r.generation_id
             WHERE r.provenance IN ('OWNER_APPROVED', 'OWNER_PREAPPROVED') AND r.created_at >= ?
             GROUP BY g.format`
            )
            .bind(since),
          db
            .prepare(
              `SELECT g.format AS format, COUNT(*) AS n FROM ai_feedback f JOIN ai_generations g ON g.id = f.generation_id
             WHERE f.kind = 'joke_missed' AND f.created_at >= ? GROUP BY g.format`
            )
            .bind(since),
          db
            .prepare(
              `SELECT g.format AS format, r.created_at - g.created_at AS ms
             FROM ai_text_revisions r JOIN ai_generations g ON g.id = r.generation_id
             WHERE r.provenance IN ('OWNER_APPROVED', 'OWNER_PREAPPROVED') AND r.created_at >= ?
             ORDER BY r.created_at DESC LIMIT ${MEDIAN_ROWS}`
            )
            .bind(since)
        ]);
      const verdicts = ((feedback?.results ?? []) as { kind: FeedbackKind; n: number }[]).map((row) => ({
        kind: row.kind,
        count: row.n
      }));
      const rows = (generations?.results ?? []) as {
        format: string;
        kind: string;
        status: string;
        result: string | null;
        source: string;
        n: number;
        warned: number | null;
      }[];
      // Only the bot's drafts can be approved, so only they make «Качество» (owner, 17.10.2026); the studio's
      // control runs are counted apart and never enter a share.
      const bot = rows.filter((row) => row.source === 'bot');
      // Rows before migration 0062 have no result; the writer could only answer with a draft then.
      const text = (row: (typeof rows)[number]) => row.status === 'ready' && row.result !== 'needs_facts';
      const sum = (from: typeof rows, match: (row: (typeof rows)[number]) => boolean) =>
        from.filter(match).reduce((total, row) => total + row.n, 0);
      const approval = approvals?.results[0] as
        { n: number; unchanged: number | null; ratio: number | null } | undefined;
      const formatRows = (formatApprovals?.results ?? []) as {
        format: string;
        n: number;
        unchanged: number | null;
        ratio: number | null;
        tagged: number | null;
        hook: number | null;
        ending: number | null;
      }[];
      const jokes = (formatJokes?.results ?? []) as { format: string; n: number }[];
      const times = (approvalTimes?.results ?? []) as { format: string; ms: number }[];
      const share = (count: number | null, of: number | null) => (of === null || of === 0 ? null : (count ?? 0) / of);
      const byFormat = WRITER_FORMATS.map((format): FormatQualityRow => {
        const mine = bot.filter((row) => row.format === format);
        const done = formatRows.find((row) => row.format === format);
        const minutes = median(times.filter((row) => row.format === format).map((row) => Math.max(0, row.ms) / 60000));
        return {
          format,
          drafts: sum(mine, (row) => row.kind === 'draft' && text(row)),
          questions: sum(mine, (row) => row.status === 'ready' && row.result === 'needs_facts'),
          approved: done?.n ?? 0,
          approvedUnchanged: done?.unchanged ?? 0,
          averageEditRatio: done?.ratio ?? null,
          hookChangedShare: share(done?.hook ?? null, done?.tagged ?? null),
          endingChangedShare: share(done?.ending ?? null, done?.tagged ?? null),
          jokeMissed: jokes.find((row) => row.format === format)?.n ?? 0,
          medianMinutesToApproval: minutes
        };
      });
      return {
        byFormat,
        drafts: sum(bot, (row) => row.kind === 'draft' && text(row)),
        rewrites: sum(bot, (row) => row.kind === 'rewrite' && text(row)),
        questions: sum(bot, (row) => row.status === 'ready' && row.result === 'needs_facts'),
        failed: sum(bot, (row) => row.status === 'failed'),
        withWarnings: bot.reduce((total, row) => total + (row.warned ?? 0), 0),
        studioDrafts: sum(rows, (row) => row.source === 'studio' && row.kind === 'draft'),
        approved: approval?.n ?? 0,
        approvedUnchanged: approval?.unchanged ?? 0,
        averageEditRatio: approval?.ratio ?? null,
        jokeMissed: verdicts.find((row) => row.kind === 'joke_missed')?.count ?? 0,
        feedback: verdicts,
        averageDraftMicroUsd: (cost?.results[0] as { cost: number | null } | undefined)?.cost ?? null,
        tagged: (tagged?.results[0] as { n: number } | undefined)?.n ?? 0,
        changedParts: ((parts?.results ?? []) as { part: string; n: number }[]).map((row) => ({
          part: row.part,
          count: row.n
        }))
      };
    },

    async periodApprovals(from, to) {
      const row = await db
        .prepare(
          `SELECT COUNT(*) AS n, AVG(edit_ratio) AS ratio FROM ai_text_revisions
           WHERE provenance IN ('OWNER_APPROVED', 'OWNER_PREAPPROVED') AND created_at >= ? AND created_at < ?`
        )
        .bind(from, to)
        .first<{ n: number; ratio: number | null }>();
      return { approved: row?.n ?? 0, averageEditRatio: row?.ratio ?? null };
    },

    async ownerExamples({ format, limit }) {
      // One approval per draft (unique index), so each row is a distinct text.
      const rows = await db
        .prepare(
          `SELECT r.text, r.created_at AS createdAt FROM ai_text_revisions r JOIN ai_generations g ON g.id = r.generation_id
           WHERE g.format = ?2 AND ${LEARNING_REVISION} AND NOT ${EXCLUDED_REVISION}
           ORDER BY r.created_at DESC LIMIT ?3`
        )
        .bind(OWNER_EXAMPLE_MIN_EDIT, format, Math.min(limit, OWNER_EXAMPLE_CANDIDATES))
        .all<{ text: string; createdAt: number }>();
      return rows.results;
    },

    async learningRevisions(limit) {
      const rows = await db
        .prepare(
          `SELECT r.id, g.format, r.text, r.edit_ratio AS editRatio, r.changed_parts AS changedParts,
                  ${EXCLUDED_REVISION} AS excluded, r.created_at AS createdAt
           FROM ai_text_revisions r JOIN ai_generations g ON g.id = r.generation_id
           WHERE ${LEARNING_REVISION}
           ORDER BY r.created_at DESC, r.id LIMIT ?2`
        )
        .bind(OWNER_EXAMPLE_MIN_EDIT, Math.min(limit, LEARNING_REVISIONS_MAX))
        .all<RawLearningRevision>();
      return rows.results.map(toLearningRevision);
    },

    async findLearningRevision(id) {
      const row = await db
        .prepare(
          `SELECT r.id, g.format, r.text, r.edit_ratio AS editRatio, r.changed_parts AS changedParts,
                  ${EXCLUDED_REVISION} AS excluded, r.created_at AS createdAt
           FROM ai_text_revisions r JOIN ai_generations g ON g.id = r.generation_id
           WHERE r.id = ?2 AND ${LEARNING_REVISION}`
        )
        .bind(OWNER_EXAMPLE_MIN_EDIT, id)
        .first<RawLearningRevision>();
      return row === null ? null : toLearningRevision(row);
    },

    async excludedPosts(ids) {
      if (ids.length === 0) return new Set();
      const rows = await db
        .prepare(
          `SELECT source_id AS id FROM ai_learning_exclusions
           WHERE source = 'post' AND source_id IN (SELECT value FROM json_each(?1))`
        )
        .bind(JSON.stringify(ids.slice(0, 100)))
        .all<{ id: string }>();
      return new Set(rows.results.map((row) => row.id));
    },

    async setExcluded({ source, id, excluded, now }) {
      await (
        excluded
          ? db
              .prepare('INSERT OR IGNORE INTO ai_learning_exclusions (source, source_id, created_at) VALUES (?, ?, ?)')
              .bind(source, id, now)
          : db.prepare('DELETE FROM ai_learning_exclusions WHERE source = ? AND source_id = ?').bind(source, id)
      ).run();
    },

    async postOrigins(postIds) {
      // D1 binds at most 100 parameters; a posts page is at most 100 rows.
      const ids = [...new Set(postIds)].slice(0, 100);
      if (ids.length === 0) return [];
      const rows = await db
        .prepare(
          `SELECT r.post_id AS postId, g.source, r.edit_ratio AS editRatio
           FROM ai_text_revisions r JOIN ai_generations g ON g.id = r.generation_id
           WHERE r.post_id IN (${ids.map(() => '?').join(', ')})`
        )
        .bind(...ids)
        .all<{ postId: string; source: 'bot' | 'studio'; editRatio: number | null }>();
      return rows.results;
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
