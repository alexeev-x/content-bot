import { Api } from 'grammy';
import { getPost, updatePost, uploadPostMedia } from '../../modules/content';
import { AppError } from '../../shared/app-error';
import type { Container } from '../container';
import { MEDIA_DRAFT_TITLE } from './draft-from-message';
import { createTelegramFileSource } from './media-import';
import { importReportText, runMediaImport, type MediaImportWorkerDeps } from './media-import-worker';
import { createTelegramCaller } from './telegram-call';

const NOTICE_TIMEOUT_MS = 5_000;
const CAPTION_ATTEMPTS = 3;

export type MediaImportContainer = Pick<
  Container,
  | 'clock'
  | 'logger'
  | 'newId'
  | 'posts'
  | 'postSummaries'
  | 'postMedia'
  | 'mediaStorage'
  | 'mediaImports'
  | 'ownerMessenger'
  | 'ownerChatId'
>;

export interface MediaImportRunner {
  /** Imports one draft's pending files within `budgetMs`; a draft another worker holds is left to it. */
  run(postId: string, budgetMs: number): Promise<void>;
  /** Cron's share: drafts with leftovers (an expired lease, a paused retry), a bounded number per call. */
  runDue(budgetMs: number, limit: number, settleMs: number): Promise<number>;
}

// Wires the import worker to the content module's public use cases and to Telegram. Built per request or
// tick, never kept: no state lives in module scope.
export function createMediaImportRunner(
  container: MediaImportContainer,
  config: { token: string; requestId: string; readAppOrigin: () => Promise<string | null> }
): MediaImportRunner {
  const { clock, logger } = container;
  const actor = container.ownerChatId ?? 'telegram-bot';
  const call = createTelegramCaller({ logger, requestId: config.requestId });
  const api = new Api(config.token);
  const source = createTelegramFileSource({
    token: config.token,
    call,
    // grammY types `signal` with a polyfill; at runtime fetch takes the platform one.
    getFile: (fileId, signal) => api.getFile(fileId, signal as never)
  });

  const postsDeps = () => ({ repo: container.posts, now: clock.now() });

  const deps: MediaImportWorkerDeps = {
    source,
    store: container.mediaImports,
    clock,
    newId: container.newId,
    postState: async (id) => {
      const state = await container.postMedia.findPostState(id);
      return state === null ? null : { revision: state.revision, mediaCount: state.media.length };
    },
    upload: (command) => {
      const storage = container.mediaStorage;
      if (storage === undefined) throw new AppError('UNAVAILABLE', 'Media storage is not configured');
      return uploadPostMedia(
        { repo: container.postMedia, storage, now: clock.now(), newId: container.newId },
        { ...command, actor }
      );
    },
    applyCaption: async (postId, input) => {
      for (let attempt = 0; attempt < CAPTION_ATTEMPTS; attempt += 1) {
        const current = await getPost({ ...postsDeps(), summaries: container.postSummaries }, postId);
        // The owner may have written text meanwhile: it wins over the caption.
        if (current.title !== MEDIA_DRAFT_TITLE || current.body !== '') return;
        try {
          await updatePost(postsDeps(), {
            actor,
            id: postId,
            input: { revision: current.revision, title: input.title, body: input.body, entities: input.entities }
          });
          return;
        } catch (error) {
          if (!(error instanceof AppError) || error.details?.reason !== 'STALE_REVISION') throw error;
        }
      }
    },
    notify: async (postId, report) => {
      const origin = await config.readAppOrigin();
      const chatId = container.ownerChatId;
      const messenger = container.ownerMessenger;
      if (chatId === null || messenger === null) return;
      const html = importReportText(report);
      const signal = AbortSignal.timeout(NOTICE_TIMEOUT_MS);
      // Cron has no request to learn the origin from: without one the text still goes out, minus the button.
      if (origin === null) {
        await api.sendMessage(chatId, html, { parse_mode: 'HTML' }, signal as never);
        return;
      }
      await messenger.sendMessageWithWebAppButton(
        chatId,
        { html, button: { text: 'Открыть', url: `${origin}/posts/${postId}` } },
        signal
      );
    },
    onError: (error) => {
      logger.error({
        component: 'bot',
        operation: 'media_import',
        requestId: config.requestId,
        errorCode: error instanceof AppError ? error.code : error instanceof Error ? error.name : 'unknown'
      });
    }
  };

  return {
    run: (postId, budgetMs) => runMediaImport(deps, postId, budgetMs),
    async runDue(budgetMs, limit, settleMs) {
      const startedAt = clock.now();
      const due = await container.mediaImports.listDue(startedAt, startedAt - settleMs, limit);
      for (const postId of due) {
        const left = budgetMs - (clock.now() - startedAt);
        if (left <= 0) break;
        await runMediaImport(deps, postId, left);
      }
      return due.length;
    }
  };
}
