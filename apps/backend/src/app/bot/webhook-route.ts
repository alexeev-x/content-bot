import { linkApprovedSourcePost } from '../workflows/approve-source-ai-draft';
import { webhookCallback } from 'grammy';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createPost } from '../../modules/content';
import { dailyReportNow, fitMessage, markContentItemContamination } from '../../modules/content-analytics';
import { timingSafeEqualStrings } from '../../platform/security/timing-safe-equal';
import { AppError } from '../../shared/app-error';
import type { AppBindings } from '../env';
import { appOriginOf } from './app-origin';
import { createAudienceBranch } from './audience-branch';
import { readSchedulerStatus } from '../rubric-scheduler/read-models';
import { rubricStatusLine } from '../rubric-scheduler/status-line';
import { createBot, loadBotSetup } from './create-bot';
import { createMediaImportRunner } from './media-import-runner';
import { createPublishActions } from './publish-actions';
import { WEBHOOK_IMPORT_BUDGET_MS } from './media-import-worker';
import { createOwnerReports } from './owner-reports';
import { getOwnerOperationsSettings } from '../../modules/settings';
import { createTelegramCaller } from './telegram-call';
import { createWriterDeps } from './writer-deps';
import { handleScriptPromptTap } from '../workflows/script-prompts';
import { notifyOwnerOfFailure } from '../notifications/failure-notice';
import { errorLogFields } from '../../platform/error-detail';

const MAX_UPDATE_BYTES = 256 * 1024;
// grammY's default is 10 s, the point where Telegram gives up on the webhook. The handler only does D1
// writes and one reply (each Bot API call is capped at 4 s), so it normally ends in well under a second;
// a stuck call is cut here, before Telegram's own deadline, and the update is not redelivered (deduped).
const WEBHOOK_TIMEOUT_MS = 8_000;
const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

// Mounted at /webhooks: the only route without a session. Authenticity is the secret header.
export const telegramWebhook = new Hono<AppBindings>().post(
  '/telegram',
  bodyLimit({
    maxSize: MAX_UPDATE_BYTES,
    onError: (c) =>
      c.json(
        {
          error: {
            code: 'VALIDATION_ERROR' as const,
            message: 'Request body is too large',
            requestId: c.get('requestId')
          }
        },
        413
      )
  }),
  async (c) => {
    // Authenticate first: without a configured secret there is no valid one, so an anonymous
    // caller gets 401 either way and cannot learn whether the bot is set up.
    const expectedSecret = c.env.TELEGRAM_WEBHOOK_SECRET ?? '';
    const provided = c.req.header(SECRET_HEADER) ?? '';
    if (expectedSecret === '' || !timingSafeEqualStrings(provided, expectedSecret)) {
      throw new AppError('UNAUTHORIZED', 'Invalid webhook secret');
    }

    // The identity is a BOT_INFO override or the row connect stored: one lookup, never a getMe per update.
    const container = c.get('container');
    const { config } = await loadBotSetup(c.env, container.botIdentity, {
      logger: container.logger,
      requestId: c.get('requestId')
    });
    if (!config) throw new AppError('UNAVAILABLE', 'Telegram bot is not configured');

    const appOrigin = appOriginOf(c.req.url);
    // Built when a command asks, so an update that needs no report never reaches for the stores.
    const reports = () =>
      createOwnerReports({
        clock: container.clock,
        appOrigin,
        publications: container.publications,
        incidents: container.dispatchJobs,
        cron: container.systemState,
        publishing: container.publishing,
        rubrics: async () =>
          rubricStatusLine(
            await readSchedulerStatus(container, async () => {
              const { background } = await getOwnerOperationsSettings({
                repo: container.settings,
                logger: container.logger,
                requestId: c.get('requestId')
              });
              return { master: background.enabled, job: background.jobs.rubricScheduler };
            })
          )
      });
    const actor = String(config.ownerId);
    const call = createTelegramCaller({ logger: container.logger, requestId: c.get('requestId') });
    const requestId = c.get('requestId');
    // Logged with the detailed description, and told to the owner once per window (owner, 28.10.2026).
    const onFailure = (error: unknown) => {
      container.logger.error({ component: 'bot', operation: 'handle_update', requestId, ...errorLogFields(error) });
      c.executionCtx.waitUntil(
        notifyOwnerOfFailure(
          {
            messenger: container.ownerMessenger,
            ownerChatId: container.ownerChatId,
            state: container.systemState,
            clock: container.clock,
            logger: container.logger
          },
          { where: 'бот: обработка сообщения', error, requestId }
        )
      );
    };
    // Built when an import starts, so an update that carries no file never reaches for the media stores.
    const imports = () =>
      createMediaImportRunner(container, {
        token: config.token,
        requestId,
        readAppOrigin: () => Promise.resolve(appOrigin)
      });
    const publish = createPublishActions(container, {
      actor,
      requestId,
      timezone: async () =>
        (await getOwnerOperationsSettings({ repo: container.settings, logger: container.logger, requestId })).timezone
    });
    const bot = createBot(config, {
      audience: createAudienceBranch(container, { ownerId: config.ownerId, hashKey: c.env.AUDIENCE_HASH_KEY }),
      // Built on first use: a webhook with no channel post never reaches for the store.
      channelPosts: { record: (chatId, messageId, at) => container.rubricChannelPosts.record(chatId, messageId, at) },
      appOrigin,
      publish,
      contamination: (itemId, reason) =>
        markContentItemContamination({ repo: container.contentAnalytics, clock: container.clock }, itemId, reason),
      clock: container.clock,
      updates: { claim: (updateId, now) => container.webhookUpdates.claim(updateId, now) },
      reports: {
        status: () => reports().status()
      },
      scriptPromptTap: async (data) =>
        handleScriptPromptTap(
          {
            links: container.aiScriptLinks,
            clock: container.clock,
            timezone: (
              await getOwnerOperationsSettings({ repo: container.settings, logger: container.logger, requestId })
            ).timezone
          },
          data
        ),
      analyticsNow: async () => ({
        // Many posts in a day could pass Telegram's limit: whole blocks go from the end, as in the daily message.
        html: fitMessage(
          await dailyReportNow({
            analytics: container.contentAnalytics,
            forecasts: container.contentForecasts,
            alerts: container.contentAlerts,
            names: container.contentVideoNames,
            clock: container.clock,
            timezone: (
              await getOwnerOperationsSettings({ repo: container.settings, logger: container.logger, requestId })
            ).timezone
          })
        ),
        button: { text: 'Открыть аналитику', url: `${appOrigin}/analytics` }
      }),
      writer: () => createWriterDeps(container, requestId, onFailure),
      rules: () => Promise.resolve(container.aiRules),
      styleLessons: () => Promise.resolve(container.aiStyleLessons),
      enqueueAiJob: (job) => container.aiJobs.send(job),
      linkSourceEventPost: (generationIds, postId) => linkApprovedSourcePost(container, generationIds, postId),
      createDraft: async (input, idempotencyKey, richHtml) =>
        createPost(
          {
            repo: container.posts,
            idempotency: container.idempotency,
            now: container.clock.now(),
            newId: container.newId
          },
          { actor, idempotencyKey, input, ...(richHtml === undefined ? {} : { richHtml }) }
        ),
      mediaImports: {
        enqueue: ({ postId, file, messageId, caption, oversized, captionTooLong }) =>
          container.mediaImports.enqueue({
            postId,
            file,
            messageId,
            caption,
            oversized,
            captionTooLong,
            now: container.clock.now()
          }),
        // After the response, so a slow download never holds the webhook; Cron finishes what is left.
        start: (postId, settleMs) =>
          c.executionCtx.waitUntil(
            (async () => {
              if (settleMs > 0) await new Promise((resolve) => setTimeout(resolve, settleMs));
              await imports().run(postId, WEBHOOK_IMPORT_BUDGET_MS);
            })().catch((error: unknown) => {
              container.logger.error({
                component: 'bot',
                operation: 'media_import',
                requestId,
                ...errorLogFields(error)
              });
            })
          )
      },
      rememberAppOrigin: (origin) => container.systemState.rememberAppOrigin(origin, container.clock.now()),
      adminApi: container.botAdminApi,
      call,
      waitUntil: (work) => c.executionCtx.waitUntil(work),
      onError: onFailure
    });
    return webhookCallback(bot, 'cloudflare-mod', {
      secretToken: config.webhookSecret,
      timeoutMilliseconds: WEBHOOK_TIMEOUT_MS
    })(c.req.raw);
  }
);
