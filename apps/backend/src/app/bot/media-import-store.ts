import type { CreatePostInput } from '@alexeev/contracts';
import type { BotMediaFile } from './media-import';

export type ImportFailure = 'too_large' | 'failed';

export interface ImportRow {
  id: string;
  file: BotMediaFile;
}

export interface ImportReport {
  done: number;
  /** An item's caption was over the post limit and was not stored. */
  captionTooLong: boolean;
  failed: { kind: BotMediaFile['kind']; failure: ImportFailure }[];
}

// D1 side of the bot's file import: the webhook only writes rows here, the worker (waitUntil, then Cron)
// does the slow part. One lease per draft makes the import serial; every transition is conditional.
export interface MediaImportStore {
  /** Stores one file of a draft. `first` is true for the update that made the draft's import record. */
  enqueue(input: {
    postId: string;
    file: BotMediaFile;
    messageId: number;
    caption: CreatePostInput | null;
    oversized: boolean;
    /** The item's caption was over the post limit: the file is kept, the caption is not. */
    captionTooLong: boolean;
    now: number;
  }): Promise<{ first: boolean }>;
  /** True when this caller may now download a file: one download at a time across the Worker. */
  claimDownload(token: string, now: number, leaseMs: number): Promise<boolean>;
  releaseDownload(token: string): Promise<void>;
  /** True when this caller now holds the draft's lease. */
  claimLease(postId: string, token: string, now: number, leaseMs: number): Promise<boolean>;
  releaseLease(postId: string, token: string, retryAt: number): Promise<void>;
  /** Drafts with work or an unsent report whose lease is free and whose files stopped arriving. */
  listDue(now: number, settledBefore: number, limit: number): Promise<string[]>;
  nextPending(postId: string): Promise<ImportRow | null>;
  /** Counts this try and returns the total; null when the lease was lost. */
  startAttempt(postId: string, token: string, rowId: string): Promise<number | null>;
  settle(
    postId: string,
    token: string,
    rowId: string,
    outcome: { status: 'done' } | { failure: ImportFailure }
  ): Promise<boolean>;
  /** The album caption, until it is applied. */
  takeCaption(postId: string, token: string, now: number): Promise<CreatePostInput | null>;
  /** True for the one caller that may send the report; false while a file or the album caption is unfinished. */
  claimReport(postId: string, now: number): Promise<boolean>;
  /** Takes the claim back after a failed send so Cron tries again, a bounded number of times. */
  reopenReport(postId: string): Promise<void>;
  report(postId: string): Promise<ImportReport>;
}

interface FileRecord {
  id: string;
  telegram_file_id: string;
  file_unique_id: string;
  kind: BotMediaFile['kind'];
  file_name: string | null;
  mime_type: string | null;
  declared_size: number | null;
}

const REPORT_ATTEMPTS = 3;

export function createD1MediaImportStore(db: D1Database, newId: () => string): MediaImportStore {
  return {
    async enqueue({ postId, file, messageId, caption, oversized, captionTooLong, now }) {
      const [created, , added] = await db.batch([
        db
          .prepare(`INSERT OR IGNORE INTO bot_media_imports (post_id, last_file_at, created_at) VALUES (?1, ?2, ?2)`)
          .bind(postId, now),
        // The first caption wins: later ones never overwrite it.
        db
          .prepare(
            `UPDATE bot_media_imports SET caption_json = ?2 WHERE post_id = ?1 AND caption_json IS NULL AND ?2 IS NOT NULL`
          )
          .bind(postId, caption === null ? null : JSON.stringify(caption)),
        db
          .prepare(
            `INSERT OR IGNORE INTO bot_media_import_files
               (id, post_id, message_id, telegram_file_id, file_unique_id, kind, file_name, mime_type, declared_size,
                status, failure, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
          )
          .bind(
            newId(),
            postId,
            messageId,
            file.fileId,
            file.uniqueId,
            file.kind,
            file.fileName,
            file.mimeType,
            file.size,
            oversized ? 'failed' : 'pending',
            oversized ? 'too_large' : null,
            now
          ),
        db
          .prepare('UPDATE bot_media_imports SET caption_too_long = 1 WHERE post_id = ?1 AND ?2 = 1')
          .bind(postId, captionTooLong ? 1 : 0)
      ]);
      const first = created?.meta.changes === 1;
      // A file that arrives after the draft's first one reopens a report that may already be sent.
      if (!first && added?.meta.changes === 1) {
        await db
          .prepare('UPDATE bot_media_imports SET reported_at = NULL, last_file_at = ?2 WHERE post_id = ?1')
          .bind(postId, now)
          .run();
      }
      return { first };
    },

    async claimLease(postId, token, now, leaseMs) {
      const result = await db
        .prepare(
          `UPDATE bot_media_imports SET lease_token = ?2, lease_until = ?3
           WHERE post_id = ?1 AND lease_until <= ?4
             AND (reported_at IS NULL
                  OR EXISTS (SELECT 1 FROM bot_media_import_files WHERE post_id = ?1 AND status = 'pending'))`
        )
        .bind(postId, token, now + leaseMs, now)
        .run();
      return result.meta.changes === 1;
    },

    async claimDownload(token, now, leaseMs) {
      const result = await db
        .prepare(
          `INSERT INTO bot_media_download_lease (id, lease_token, lease_until) VALUES (1, ?1, ?2)
           ON CONFLICT (id) DO UPDATE SET lease_token = excluded.lease_token, lease_until = excluded.lease_until
           WHERE bot_media_download_lease.lease_until <= ?3`
        )
        .bind(token, now + leaseMs, now)
        .run();
      return result.meta.changes === 1;
    },

    async releaseDownload(token) {
      await db
        .prepare('UPDATE bot_media_download_lease SET lease_until = 0 WHERE id = 1 AND lease_token = ?1')
        .bind(token)
        .run();
    },

    async releaseLease(postId, token, retryAt) {
      await db
        .prepare('UPDATE bot_media_imports SET lease_until = ?3 WHERE post_id = ?1 AND lease_token = ?2')
        .bind(postId, token, retryAt)
        .run();
    },

    async listDue(now, settledBefore, limit) {
      const { results } = await db
        .prepare(
          `SELECT post_id FROM bot_media_imports
           WHERE reported_at IS NULL AND lease_until <= ?1 AND last_file_at <= ?2
           ORDER BY last_file_at, post_id LIMIT ?3`
        )
        .bind(now, settledBefore, limit)
        .all<{ post_id: string }>();
      return results.map((row) => row.post_id);
    },

    async nextPending(postId) {
      const row = await db
        .prepare(
          `SELECT id, telegram_file_id, file_unique_id, kind, file_name, mime_type, declared_size
           FROM bot_media_import_files WHERE post_id = ?1 AND status = 'pending'
           ORDER BY message_id, id LIMIT 1`
        )
        .bind(postId)
        .first<FileRecord>();
      if (row === null) return null;
      return {
        id: row.id,
        file: {
          fileId: row.telegram_file_id,
          uniqueId: row.file_unique_id,
          kind: row.kind,
          fileName: row.file_name,
          mimeType: row.mime_type,
          size: row.declared_size
        }
      };
    },

    async startAttempt(postId, token, rowId) {
      const row = await db
        .prepare(
          `UPDATE bot_media_import_files SET attempts = attempts + 1
           WHERE id = ?1 AND status = 'pending'
             AND EXISTS (SELECT 1 FROM bot_media_imports WHERE post_id = ?2 AND lease_token = ?3)
           RETURNING attempts`
        )
        .bind(rowId, postId, token)
        .first<{ attempts: number }>();
      return row?.attempts ?? null;
    },

    async settle(postId, token, rowId, outcome) {
      const failure = 'failure' in outcome ? outcome.failure : null;
      const result = await db
        .prepare(
          `UPDATE bot_media_import_files SET status = ?4, failure = ?5
           WHERE id = ?1 AND status = 'pending'
             AND EXISTS (SELECT 1 FROM bot_media_imports WHERE post_id = ?2 AND lease_token = ?3)`
        )
        .bind(rowId, postId, token, failure === null ? 'done' : 'failed', failure)
        .run();
      return result.meta.changes === 1;
    },

    async takeCaption(postId, token, now) {
      const row = await db
        .prepare(
          `UPDATE bot_media_imports SET caption_applied_at = ?3
           WHERE post_id = ?1 AND lease_token = ?2 AND caption_json IS NOT NULL AND caption_applied_at IS NULL
           RETURNING caption_json`
        )
        .bind(postId, token, now)
        .first<{ caption_json: string }>();
      return row === null ? null : (JSON.parse(row.caption_json) as CreatePostInput);
    },

    async claimReport(postId, now) {
      const result = await db
        .prepare(
          `UPDATE bot_media_imports SET reported_at = ?2, report_attempts = report_attempts + 1
           WHERE post_id = ?1 AND reported_at IS NULL
             AND NOT (caption_json IS NOT NULL AND caption_applied_at IS NULL)
             AND NOT EXISTS (SELECT 1 FROM bot_media_import_files WHERE post_id = ?1 AND status = 'pending')`
        )
        .bind(postId, now)
        .run();
      return result.meta.changes === 1;
    },

    async reopenReport(postId) {
      await db
        .prepare('UPDATE bot_media_imports SET reported_at = NULL WHERE post_id = ?1 AND report_attempts < ?2')
        .bind(postId, REPORT_ATTEMPTS)
        .run();
    },

    async report(postId) {
      const imports = await db
        .prepare('SELECT caption_too_long FROM bot_media_imports WHERE post_id = ?1')
        .bind(postId)
        .first<{ caption_too_long: number }>();
      const { results } = await db
        .prepare(
          `SELECT kind, status, failure FROM bot_media_import_files
           WHERE post_id = ?1 AND status != 'pending' ORDER BY message_id, id LIMIT 20`
        )
        .bind(postId)
        .all<{ kind: BotMediaFile['kind']; status: 'done' | 'failed'; failure: ImportFailure | null }>();
      return {
        captionTooLong: imports?.caption_too_long === 1,
        done: results.filter((row) => row.status === 'done').length,
        failed: results.flatMap((row) =>
          row.status === 'failed' && row.failure !== null ? [{ kind: row.kind, failure: row.failure }] : []
        )
      };
    }
  };
}
