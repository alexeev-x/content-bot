import { webhookCallback } from 'grammy';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createPost } from '../../modules/content';
import {
  dailyReportNow,
  markContentItemContamination,
  memberChange,
  recordChannelMember
} from '../../modules/content-analytics';
import { timingSafeEqualStrings } from '../../platform/security/timing-safe-equal';
import { AppError } from '../../shared/app-error';
import type { AppBindings } from '../env';
import { appOriginOf } from './app-origin';
import { createBot, loadBotSetup } from './create-bot';
import { createMediaImportRunner } from './media-import-runner';
import { createPublishActions } from './publish-actions';
import { WEBHOOK_IMPORT_BUDGET_MS } from './media-import-worker';
import { createOwnerReports } from './owner-reports';
import { getOwnerOperationsSettings } from '../../modules/settings';
import { createTelegramCaller } from './telegram-call';
import { createWriterDeps } from './writer-deps';
import { handleScriptPromptTap } from '../workflows/script-prompts';

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
        publishing: container.publishing
      });
    const actor = String(config.ownerId);
    const call = createTelegramCaller({ logger: container.logger, requestId: c.get('requestId') });
    const requestId = c.get('requestId');
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
      appOrigin,
      publish,
      contamination: (itemId, reason) =>
        markContentItemContamination({ repo: container.contentAnalytics, clock: container.clock }, itemId, reason),
      clock: container.clock,
      updates: { claim: (updateId, now) => container.webhookUpdates.claim(updateId, now) },
      channelMember: async (updateId, update) => {
        const channel = container.analyticsTelegramChannel?.trim().replace(/^@/, '').toLowerCase();
        if (!channel || update.chat.username?.toLowerCase() !== channel) return;
        if (!(await container.webhookUpdates.claim(updateId, container.clock.now()))) return;
        const recorded = await recordChannelMember(
          { repo: container.inviteLinks, channel: container.analyticsTelegramChannel, newId: container.newId },
          {
            chatUsername: update.chat.username,
            userId: update.new_chat_member.user.id,
            isBot: update.new_chat_member.user.is_bot,
            change: memberChange(update.old_chat_member, update.new_chat_member),
            inviteUrl: update.invite_link?.invite_link ?? null,
            at: update.date * 1000
          }
        );
        // Only the outcome: never the person, the link or the raw update.
        container.logger.info({ component: 'bot', operation: 'channel_member', requestId, status: recorded });
      },
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
        html: await dailyReportNow({
          analytics: container.contentAnalytics,
          forecasts: container.contentForecasts,
          clock: container.clock,
          timezone: (
            await getOwnerOperationsSettings({ repo: container.settings, logger: container.logger, requestId })
          ).timezone
        }),
        button: { text: 'Открыть аналитику', url: `${appOrigin}/analytics` }
      }),
      writer: () => createWriterDeps(container, requestId),
      rules: () => Promise.resolve(container.aiRules),
      styleLessons: () => Promise.resolve(container.aiStyleLessons),
      enqueueAiJob: (job) => container.aiJobs.send(job),
      linkSourceEventPost: async (generationIds, postId) => {
        await container.dotaRepository.linkAiPost({ generationIds, postId, now: container.clock.now() });
      },
      createDraft: async (input, idempotencyKey) =>
        createPost(
          {
            repo: container.posts,
            idempotency: container.idempotency,
            now: container.clock.now(),
            newId: container.newId
          },
          { actor, idempotencyKey, input }
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
                errorCode: error instanceof Error ? error.name : 'unknown'
              });
            })
          )
      },
      rememberAppOrigin: (origin) => container.systemState.rememberAppOrigin(origin, container.clock.now()),
      adminApi: container.botAdminApi,
      call,
      waitUntil: (work) => c.executionCtx.waitUntil(work),
      onError: (error) => {
        container.logger.error({
          component: 'bot',
          operation: 'handle_update',
          requestId: c.get('requestId'),
          errorCode: error instanceof Error ? error.name : 'unknown'
        });
      }
    });
    return webhookCallback(bot, 'cloudflare-mod', {
      secretToken: config.webhookSecret,
      timeoutMilliseconds: WEBHOOK_TIMEOUT_MS
    })(c.req.raw);
  }
);
