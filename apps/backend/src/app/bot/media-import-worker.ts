import type { CreatePostInput } from '@alexeev/contracts';
import type { Clock } from '../../platform/clock';
import { DOWNLOAD_TIMEOUT_MS, type ImportMediaDeps, importMedia } from './media-import';
import type { ImportReport, MediaImportStore } from './media-import-store';

// A worker that dies mid-file frees the draft when this runs out; the idempotency key makes the retry safe.
const LEASE_MS = 60_000;
// A file that failed for a transient reason is tried again by Cron after this pause, at most this many times.
const RETRY_DELAY_MS = 30_000;
const MAX_ATTEMPTS = 3;
// Covers getFile, the download and the attach of one file; the next try comes from Cron or the next file.
const DOWNLOAD_LEASE_MS = 45_000;
const DOWNLOAD_BUSY_RETRY_MS = 5_000;
// No new file is started with less than this left: getFile (8 s) plus a short download need room.
const MIN_FILE_BUDGET_MS = 6_000;
/** Album updates arrive within a moment of each other; the worker waits so the files attach in message order. */
export const ALBUM_SETTLE_MS = 1_500;
/** How long the webhook's `waitUntil` run may work (the platform allows 30 s after the response). */
export const WEBHOOK_IMPORT_BUDGET_MS = 25_000;
export const CRON_IMPORT_BUDGET_MS = 20_000;
export const CRON_IMPORT_POSTS = 2;

export interface MediaImportWorkerDeps extends ImportMediaDeps {
  store: MediaImportStore;
  clock: Clock;
  newId: () => string;
  /** Gives an album draft its caption unless the draft already has text of its own. */
  applyCaption: (postId: string, input: CreatePostInput) => Promise<void>;
  /** Tells the owner how the import ended; best effort. */
  notify: (postId: string, report: ImportReport) => Promise<void>;
  onError: (error: unknown) => void;
}

export const CAPTION_TOO_LONG_NOTE = 'Подпись длиннее 4096 символов, она не сохранена.';

export function importReportText(report: ImportReport): string {
  const note = report.captionTooLong ? `\n${CAPTION_TOO_LONG_NOTE}` : '';
  if (report.failed.length === 0) return `Файлы загружены в черновик: ${report.done}.${note}`;
  const lines = report.failed.map((item) => {
    const kind = item.kind === 'photo' ? 'Фото' : item.kind === 'video' ? 'Видео' : 'GIF';
    return `${kind}: ${item.failure === 'too_large' ? 'слишком большой файл' : 'не удалось загрузить'}`;
  });
  return `Загружено файлов: ${report.done}. Не загружены:\n${lines.join('\n')}${note}`;
}

async function applyAlbumCaption(deps: MediaImportWorkerDeps, postId: string, token: string): Promise<void> {
  const caption = await deps.store.takeCaption(postId, token, deps.clock.now());
  if (caption === null) return;
  try {
    await deps.applyCaption(postId, caption);
  } catch (error) {
    // A caption that cannot be applied costs the owner a retype, never the files.
    deps.onError(error);
  }
}

// Imports the pending files of one draft, one at a time, and sends the owner the result when none is left.
// Safe to call from any number of places at once: the lease lets one caller work, the others return.
export async function runMediaImport(deps: MediaImportWorkerDeps, postId: string, budgetMs: number): Promise<void> {
  const token = deps.newId();
  const startedAt = deps.clock.now();
  if (!(await deps.store.claimLease(postId, token, startedAt, LEASE_MS))) return;
  let retryAt = 0;
  try {
    await applyAlbumCaption(deps, postId, token);
    for (;;) {
      const row = await deps.store.nextPending(postId);
      if (row === null) break;
      const remaining = startedAt + budgetMs - deps.clock.now();
      if (remaining < MIN_FILE_BUDGET_MS) return;
      // Before the attempt is counted: a busy Worker is not the file's fault. The row stays pending.
      const downloadToken = deps.newId();
      if (!(await deps.store.claimDownload(downloadToken, deps.clock.now(), DOWNLOAD_LEASE_MS))) {
        retryAt = deps.clock.now() + DOWNLOAD_BUSY_RETRY_MS;
        return;
      }
      let outcome: Awaited<ReturnType<typeof importMedia>> | 'exhausted';
      try {
        const attempts = await deps.store.startAttempt(postId, token, row.id);
        if (attempts === null) return;
        outcome =
          attempts > MAX_ATTEMPTS
            ? 'exhausted'
            : await importMedia(
                deps,
                postId,
                row.file,
                `tg-import-${row.id}`,
                Math.min(DOWNLOAD_TIMEOUT_MS, remaining - 2_000)
              );
      } catch (error) {
        deps.onError(error);
        // Order matters (files attach by message id), so a transient failure pauses the whole draft.
        retryAt = deps.clock.now() + RETRY_DELAY_MS;
        return;
      } finally {
        await deps.store.releaseDownload(downloadToken).catch(deps.onError);
      }
      await deps.store.settle(
        postId,
        token,
        row.id,
        outcome === 'attached' ? { status: 'done' } : { failure: outcome === 'exhausted' ? 'failed' : outcome }
      );
    }
    // Read again: the caption can arrive while the files were downloading.
    await applyAlbumCaption(deps, postId, token);
    if (await deps.store.claimReport(postId, deps.clock.now())) {
      try {
        await deps.notify(postId, await deps.store.report(postId));
      } catch (error) {
        deps.onError(error);
        // Not delivered, so not reported: Cron sends it again (a bounded number of times).
        await deps.store.reopenReport(postId).catch(deps.onError);
        retryAt = deps.clock.now() + RETRY_DELAY_MS;
      }
    }
  } finally {
    await deps.store.releaseLease(postId, token, retryAt).catch(deps.onError);
  }
}
