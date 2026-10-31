import type { ScoreRepository, ThemesRepository, WeekBlockRepository } from '../application/ports';
import { COMMENT_KINDS, type CommentKind } from '../constants';
import type { PostSlices, ScoreRow } from '../domain/types';
import type { WeekBlock } from '../domain/week-block';

// D1 for the rubric analytics (migration 0121). Every write is keyed by the channel's message, the Moscow day or the
// Monday, so a repeated queue delivery writes nothing new.

const SCORE_COLUMNS = `chat_id, message_id, slot_id, rubric_key, role, sent_at, scored_at, views24, likes24, comments24,
  voters24, views72, x_views, x_reactions, x_comments, x_votes, composite, slices_json`;

interface ScoreDbRow {
  chat_id: string;
  message_id: number;
  slot_id: string;
  rubric_key: string;
  role: 'main' | 'followup';
  sent_at: number;
  scored_at: number;
  views24: number;
  likes24: number | null;
  comments24: number | null;
  voters24: number | null;
  views72: number | null;
  x_views: number;
  x_reactions: number | null;
  x_comments: number | null;
  x_votes: number | null;
  composite: number;
  slices_json: string;
}

const toRow = (row: ScoreDbRow): ScoreRow => ({
  chatId: row.chat_id,
  messageId: row.message_id,
  slotId: row.slot_id,
  rubric: row.rubric_key,
  role: row.role,
  sentAt: row.sent_at,
  scoredAt: row.scored_at,
  views24: row.views24,
  likes24: row.likes24,
  comments24: row.comments24,
  voters24: row.voters24,
  views72: row.views72,
  xViews: row.x_views,
  xReactions: row.x_reactions,
  xComments: row.x_comments,
  xVotes: row.x_votes,
  composite: row.composite,
  slices: JSON.parse(row.slices_json) as PostSlices
});

/** IN lists stay under D1's 100 bound parameters. */
const IN_MAX = 90;
const placeholders = (count: number) => Array.from({ length: count }, () => '?').join(', ');

export function createD1ScoreRepository(db: D1Database, clock: { now(): number }): ScoreRepository {
  return {
    async scoredKeys(chatId, messageIds) {
      const ids = messageIds.slice(0, IN_MAX);
      if (ids.length === 0) return new Set();
      const { results } = await db
        .prepare(
          `SELECT message_id FROM rubric_post_scores WHERE chat_id = ? AND message_id IN (${placeholders(ids.length)})`
        )
        .bind(chatId, ...ids)
        .all<{ message_id: number }>();
      return new Set(results.map((row) => row.message_id));
    },

    async insert(rows) {
      if (rows.length === 0) return 0;
      const now = clock.now();
      const statement = db.prepare(
        `INSERT OR IGNORE INTO rubric_post_scores (chat_id, message_id, slot_id, rubric_key, role, sent_at, scored_at,
           version, views24, likes24, comments24, voters24, base_json, x_views, x_reactions, x_comments, x_votes,
           composite, slices_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const results = await db.batch(
        rows.map((row) =>
          statement.bind(
            row.chatId,
            row.messageId,
            row.slotId,
            row.rubric,
            row.role,
            row.sentAt,
            now,
            row.version,
            row.views24,
            row.likes24,
            row.comments24,
            row.voters24,
            JSON.stringify(row.base),
            row.xViews,
            row.xReactions,
            row.xComments,
            row.xVotes,
            row.composite,
            JSON.stringify(row.slices)
          )
        )
      );
      return results.reduce((total, result) => total + (result.meta.changes ?? 0), 0);
    },

    async lateRows(before, limit) {
      const { results } = await db
        .prepare(
          `SELECT chat_id, message_id, sent_at, json_extract(base_json, '$.poll') AS poll FROM rubric_post_scores
            WHERE views72 IS NULL AND sent_at <= ? ORDER BY sent_at LIMIT ?`
        )
        .bind(before, limit)
        .all<{ chat_id: string; message_id: number; sent_at: number; poll: number | null }>();
      return results.map((row) => ({
        chatId: row.chat_id,
        messageId: row.message_id,
        sentAt: row.sent_at,
        poll: row.poll
      }));
    },

    async fillLate(rows) {
      if (rows.length === 0) return;
      const statement = db.prepare(
        `UPDATE rubric_post_scores SET views72 = ?, likes72 = ?, comments72 = ?, voters72 = ?
          WHERE chat_id = ? AND message_id = ? AND views72 IS NULL`
      );
      await db.batch(
        rows.map((row) =>
          statement.bind(row.views72, row.likes72, row.comments72, row.voters72, row.chatId, row.messageId)
        )
      );
    },

    async bySent(range, limit) {
      const rubric = range.rubric === undefined ? '' : 'AND rubric_key = ?';
      const { results } = await db
        .prepare(
          `SELECT ${SCORE_COLUMNS} FROM rubric_post_scores WHERE sent_at >= ? AND sent_at < ? ${rubric}
            ORDER BY sent_at DESC LIMIT ?`
        )
        .bind(range.from, range.to, ...(range.rubric === undefined ? [] : [range.rubric]), limit)
        .all<ScoreDbRow>();
      return results.map(toRow);
    },

    async byScored(from, to) {
      const { results } = await db
        .prepare(
          `SELECT ${SCORE_COLUMNS} FROM rubric_post_scores WHERE scored_at >= ? AND scored_at < ?
            ORDER BY scored_at LIMIT 500`
        )
        .bind(from, to)
        .all<ScoreDbRow>();
      return results.map(toRow);
    },

    async countsSince(since) {
      const { results } = await db
        .prepare(
          `SELECT rubric_key, COUNT(*) AS n FROM rubric_post_scores WHERE sent_at >= ? AND role = 'main'
            GROUP BY rubric_key`
        )
        .bind(since)
        .all<{ rubric_key: string; n: number }>();
      return new Map(results.map((row) => [row.rubric_key, row.n]));
    }
  };
}

export function createD1WeekBlockRepository(db: D1Database): WeekBlockRepository {
  return {
    async get(weekKey) {
      const row = await db
        .prepare('SELECT week_key, cut_from, cut_to, data_json FROM rubric_week_blocks WHERE week_key = ?')
        .bind(weekKey)
        .first<{ week_key: string; cut_from: number; cut_to: number; data_json: string }>();
      return row === null
        ? null
        : {
            weekKey: row.week_key,
            cutFrom: row.cut_from,
            cutTo: row.cut_to,
            data: JSON.parse(row.data_json) as WeekBlock
          };
    },
    async latest() {
      const row = await db
        .prepare('SELECT week_key, cut_to FROM rubric_week_blocks ORDER BY week_key DESC LIMIT 1')
        .first<{ week_key: string; cut_to: number }>();
      return row === null ? null : { weekKey: row.week_key, cutTo: row.cut_to };
    },
    async insert(row) {
      const result = await db
        .prepare(
          `INSERT OR IGNORE INTO rubric_week_blocks (week_key, cut_from, cut_to, data_json, created_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(row.weekKey, row.cutFrom, row.cutTo, JSON.stringify(row.data), row.createdAt)
        .run();
      return (result.meta.changes ?? 0) === 1;
    }
  };
}

interface ThemeDbRow {
  chat_id: string;
  message_id: number;
  rubric_key: string;
  run_day: string;
  comments: number;
  commenters: number;
  limited: number;
  kinds_json: string;
  topics_json: string;
  quote: string | null;
  created_at: number;
}

const emptyKinds = (): Record<CommentKind, number> =>
  Object.fromEntries(COMMENT_KINDS.map((kind) => [kind, 0])) as Record<CommentKind, number>;

export function createD1ThemesRepository(db: D1Database): ThemesRepository {
  return {
    async claimRun(day, now, leaseMs) {
      const inserted = await db
        .prepare(
          `INSERT OR IGNORE INTO rubric_summary_runs (day_msk, status, attempts, lease_until, started_at)
           VALUES (?, 'running', 1, ?, ?)`
        )
        .bind(day, now + leaseMs, now)
        .run();
      if ((inserted.meta.changes ?? 0) === 1) return true;
      // A run whose worker died: re-claimed once its lease is over, at most three attempts.
      const reclaimed = await db
        .prepare(
          `UPDATE rubric_summary_runs SET lease_until = ?, attempts = attempts + 1
            WHERE day_msk = ? AND status = 'running' AND lease_until < ? AND attempts < 3`
        )
        .bind(now + leaseMs, day, now)
        .run();
      return (reclaimed.meta.changes ?? 0) === 1;
    },
    async finishRun(day, result, now) {
      await db
        .prepare(
          `UPDATE rubric_summary_runs SET status = ?, error_code = ?, model = ?, input_comments = ?, finished_at = ?,
             lease_until = NULL WHERE day_msk = ? AND status = 'running'`
        )
        .bind(result.status, result.errorCode ?? null, result.model ?? null, result.inputComments ?? null, now, day)
        .run();
    },
    async lastRun() {
      const row = await db
        .prepare('SELECT day_msk, status, error_code FROM rubric_summary_runs ORDER BY day_msk DESC LIMIT 1')
        .first<{ day_msk: string; status: string; error_code: string | null }>();
      return row === null ? null : { day: row.day_msk, status: row.status, errorCode: row.error_code };
    },
    async themed(chatId, messageIds) {
      const ids = messageIds.slice(0, IN_MAX);
      if (ids.length === 0) return new Set();
      const { results } = await db
        .prepare(
          `SELECT message_id FROM rubric_comment_themes WHERE chat_id = ? AND message_id IN (${placeholders(ids.length)})`
        )
        .bind(chatId, ...ids)
        .all<{ message_id: number }>();
      return new Set(results.map((row) => row.message_id));
    },
    async insert(rows) {
      if (rows.length === 0) return;
      const statement = db.prepare(
        `INSERT OR IGNORE INTO rubric_comment_themes (chat_id, message_id, rubric_key, run_day, comments, commenters,
           limited, kinds_json, topics_json, quote, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      await db.batch(
        rows.map((row) =>
          statement.bind(
            row.chatId,
            row.messageId,
            row.rubric,
            row.runDay,
            row.comments,
            row.commenters,
            row.limited ? 1 : 0,
            JSON.stringify(row.kinds),
            JSON.stringify(row.topics),
            row.quote,
            row.createdAt
          )
        )
      );
    },
    async since(since, rubric) {
      const { results } = await db
        .prepare(
          `SELECT chat_id, message_id, rubric_key, run_day, comments, commenters, limited, kinds_json, topics_json,
             quote, created_at FROM rubric_comment_themes WHERE created_at >= ? ${rubric === undefined ? '' : 'AND rubric_key = ?'}
            ORDER BY created_at DESC LIMIT 300`
        )
        .bind(since, ...(rubric === undefined ? [] : [rubric]))
        .all<ThemeDbRow>();
      return results.map((row) => ({
        chatId: row.chat_id,
        messageId: row.message_id,
        rubric: row.rubric_key,
        runDay: row.run_day,
        comments: row.comments,
        commenters: row.commenters,
        limited: row.limited === 1,
        kinds: { ...emptyKinds(), ...(JSON.parse(row.kinds_json) as Partial<Record<CommentKind, number>>) },
        topics: JSON.parse(row.topics_json) as { label: string; count: number }[],
        quote: row.quote,
        createdAt: row.created_at
      }));
    }
  };
}

export { emptyKinds };
