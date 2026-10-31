import type { QueryBudget } from '../../platform/d1-budget';
import { Api } from 'grammy';
import { getPost, updatePost, uploadPostMedia } from '../../modules/content';
import { getOwnerOperationsSettings } from '../../modules/settings';
import { AppError } from '../../shared/app-error';
import type { Container } from '../container';
import { createTelegramFileSource } from './media-import';
import { createPublishActions, type PublishActionsContainer } from './publish-actions';
import { publishKeyboard } from './publish-keyboard';
import { importReportText, RUN_MIN_BUDGET, runMediaImport, type MediaImportWorkerDeps } from './media-import-worker';
import { createTelegramCaller } from './telegram-call';
import { errorLogFields } from '../../platform/error-detail';

const NOTICE_TIMEOUT_MS = 5_000;
const CAPTION_ATTEMPTS = 3;

export type MediaImportContainer = Pick<
  Container,
  | 'clock'
  | 'queryBudget'
  | 'logger'
  | 'newId'
  | 'posts'
  | 'postSummaries'
  | 'postMedia'
  | 'mediaStorage'
  | 'mediaImports'
  | 'ownerMessenger'
  | 'ownerChatId'
  | 'settings'
> &
  PublishActionsContainer;

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
  config: {
    token: string;
    requestId: string;
    readAppOrigin: () => Promise<string | null>;
    /** Subrequests kept free for work that runs after the import in the same invocation (the Cron heartbeat). */
    reserve?: number;
  }
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

  const publishActions = createPublishActions(container, {
    actor,
    requestId: config.requestId,
    timezone: async () =>
      (await getOwnerOperationsSettings({ repo: container.settings, logger, requestId: config.requestId })).timezone
  });

  const postsDeps = () => ({ repo: container.posts, now: clock.now() });

  const deps: MediaImportWorkerDeps = {
    source,
    store: container.mediaImports,
    budget: withReserve(container.queryBudget, config.reserve ?? 0),
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
        if (current.body !== '') return;
        try {
          await updatePost(postsDeps(), {
            actor,
            id: postId,
            input: {
              revision: current.revision,
              body: input.body,
              entities: input.entities
            }
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
      // Buttons only for a draft that still is one and has files (an approved post would refuse them);
      // the tap re-checks everything.
      const state = await container.postMedia.findPostState(postId);
      const buttons =
        state === null || state.status !== 'draft' || state.media.length === 0
          ? []
          : await publishActions.buttons({ id: postId, revision: state.revision });
      // Cron has no request to learn the origin from: without one the text still goes out, minus the Studio button.
      container.queryBudget.charge(1);
      const markup = publishKeyboard({ appOrigin: origin, postId, buttons, studio: 'post' });
      if (markup === undefined) {
        await api.sendMessage(chatId, html, { parse_mode: 'HTML' }, signal as never);
        return;
      }
      await messenger.sendMessageWithKeyboard(chatId, { html, markup }, signal);
    },
    onError: (error) => {
      logger.error({
        component: 'bot',
        operation: 'media_import',
        requestId: config.requestId,
        ...errorLogFields(error)
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
        if (left <= 0 || container.queryBudget.remaining() < RUN_MIN_BUDGET) break;
        await runMediaImport(deps, postId, left);
      }
      return due.length;
    }
  };
}

/** The same allowance, minus what later steps of this invocation still need. */
function withReserve(budget: QueryBudget, reserve: number): QueryBudget {
  if (reserve <= 0) return budget;
  return {
    limit: budget.limit,
    used: () => budget.used(),
    remaining: () => Math.max(0, budget.remaining() - reserve),
    charge: (count) => budget.charge(count)
  };
}
