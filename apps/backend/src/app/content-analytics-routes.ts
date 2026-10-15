import {
  contentAnalyticsOverviewSchema,
  contentGoalInputSchema,
  contentGoalParamsSchema,
  contentGoalsSchema,
  contentItemDetailSchema,
  contentItemIdSchema,
  contentItemsPageSchema,
  contentItemsQuerySchema,
  contentReportQuerySchema,
  contentReportSchema,
  messagePreviewsResultSchema,
  tiktokConnectSchema
} from '@alexeev/contracts';
import { GrammyError } from 'grammy';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  collectContentAnalytics,
  listContentItems,
  readContentAnalyticsOverview,
  completeTikTokConnect,
  type ConnectResult,
  disconnectTikTok,
  readContentItem,
  readContentGoals,
  readContentReport,
  removeContentGoal,
  setContentGoal,
  startTikTokConnect,
  TIKTOK_STATE_TTL_SEC
} from '../modules/content-analytics';
import { getOwnerOperationsSettings } from '../modules/settings';
import { AppError } from '../shared/app-error';
import { appOriginOf } from './bot/app-origin';
import { buildMessageCatalog } from './notifications/message-catalog';
import { sendMessageCatalog } from './workflows/send-message-catalog';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { rateLimitClientKey } from '../platform/rate-limit/client-key';
import type { AppBindings } from './env';
import { validated } from './validation';

const PREVIEW_INTRO = [
  '🧪 <b>Все сообщения бота</b>',
  '',
  'Дальше по разделам идёт каждое сообщение, которое бот присылает вам, в том виде, в каком оно приходит сейчас.',
  'Публикации и каналы в примерах условные; отчёты /today, /next, /status и сводка недели — с настоящими данными.',
  '',
  'В конце — аналитика в нескольких стилях (А–Д, вариант подписан внизу). Напишите, какой оставить: он станет общим для всех сообщений.'
].join('\n');

const itemParamsSchema = z.strictObject({ id: contentItemIdSchema });
// TikTok's redirect: every field optional and bounded; anything else in the query is ignored.
const callbackQuerySchema = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(128).optional(),
  error: z.string().min(1).max(200).optional()
});
const CALLBACK_PATH = '/api/v1/content-analytics/tiktok/callback';
// Ties the OAuth state to the browser that started the connection; only the callback ever receives it.
const STATE_COOKIE = 'tiktok_oauth_state';

/** The redirect URI must match the one registered in the TikTok app: this Worker's own origin. */
function callbackUri(requestUrl: string): string {
  return `${new URL(requestUrl).origin}${CALLBACK_PATH}`;
}

function tiktokDeps(container: AppBindings['Variables']['container']) {
  const config = container.contentSources.tiktok;
  if (config === null) throw new AppError('UNAVAILABLE', 'TikTok app keys are not configured');
  return { repo: container.tiktokConnections, config, clock: container.clock, fetchImpl: container.contentFetch };
}

export const contentAnalyticsRoutes = new Hono<AppBindings>()
  .get('/', async (c) => {
    const container = c.get('container');
    return c.json(
      contentAnalyticsOverviewSchema.parse(
        await readContentAnalyticsOverview({
          repo: container.contentAnalytics,
          sources: container.contentSources,
          clock: container.clock
        })
      )
    );
  })
  .post('/sync', async (c) => {
    const container = c.get('container');
    const repo = container.contentAnalytics;
    const sources = container.contentSources;
    await collectContentAnalytics({
      repo,
      sources,
      clock: container.clock,
      logger: container.logger,
      requestId: c.get('requestId'),
      manual: true
    });
    return c.json(
      contentAnalyticsOverviewSchema.parse(
        await readContentAnalyticsOverview({ repo, sources, clock: container.clock })
      )
    );
  })
  .get('/report', validated('query', contentReportQuerySchema), async (c) => {
    const container = c.get('container');
    return c.json(
      contentReportSchema.parse(
        await readContentReport({ repo: container.contentAnalytics, clock: container.clock }, c.req.valid('query'))
      )
    );
  })
  .post('/tiktok/connect', async (c) => {
    const container = c.get('container');
    const { authorizeUrl, state } = await startTikTokConnect(tiktokDeps(container), callbackUri(c.req.url));
    setCookie(c, STATE_COOKIE, state, {
      httpOnly: true,
      secure: true,
      // Lax: sent on TikTok's top-level redirect back, never on cross-site subrequests.
      sameSite: 'Lax',
      path: CALLBACK_PATH,
      maxAge: TIKTOK_STATE_TTL_SEC
    });
    return c.json(tiktokConnectSchema.parse({ authorizeUrl }));
  })
  .get('/tiktok/callback', async (c) => {
    const container = c.get('container');
    const browserState = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: CALLBACK_PATH, secure: true });
    // Always a redirect back to the app, never a JSON error page in the owner's browser.
    let result: ConnectResult = 'failed';
    try {
      const decision = await container.rateLimiter.hit({
        name: 'tiktok-callback',
        client: rateLimitClientKey(c.req.header('cf-connecting-ip')),
        limit: 20,
        windowMs: 10 * 60 * 1000,
        now: container.clock.now()
      });
      const parsed = callbackQuerySchema.safeParse(c.req.query());
      const query = parsed.success ? parsed.data : {};
      const config = container.contentSources.tiktok;
      if (decision.allowed && config !== null) {
        result = await completeTikTokConnect(
          {
            repo: container.tiktokConnections,
            config,
            clock: container.clock,
            fetchImpl: container.contentFetch,
            logger: container.logger,
            requestId: c.get('requestId')
          },
          {
            state: query.state,
            browserState,
            code: query.code,
            error: query.error,
            redirectUri: callbackUri(c.req.url)
          }
        );
      }
    } catch (error) {
      container.logger.error({
        requestId: c.get('requestId'),
        component: 'content-analytics',
        operation: 'tiktok_callback',
        status: 'error',
        errorCode: error instanceof Error ? error.name : 'UNKNOWN'
      });
    }
    // A relative redirect keeps the browser on this origin whatever the query held.
    return c.redirect(`/analytics?platform=tiktok&tiktok=${result}`, 302);
  })
  .post('/tiktok/disconnect', async (c) => {
    const container = c.get('container');
    await disconnectTikTok({ ...tiktokDeps(container), logger: container.logger, requestId: c.get('requestId') });
    return c.body(null, 204);
  })
  .get('/items', validated('query', contentItemsQuerySchema), async (c) => {
    const container = c.get('container');
    return c.json(
      contentItemsPageSchema.parse(await listContentItems(container.contentAnalytics, c.req.valid('query')))
    );
  })
  .get('/items/:id', validated('param', itemParamsSchema), async (c) => {
    const container = c.get('container');
    return c.json(
      contentItemDetailSchema.parse(
        await readContentItem({ repo: container.contentAnalytics, clock: container.clock }, c.req.valid('param').id)
      )
    );
  })
  .post('/message-previews', async (c) => {
    const container = c.get('container');
    const messenger = container.ownerMessenger;
    if (messenger === null) throw new AppError('UNAVAILABLE', 'The bot token is not configured');
    const { timezone } = await getOwnerOperationsSettings({
      repo: container.settings,
      logger: container.logger,
      requestId: c.get('requestId')
    });
    const appOrigin = appOriginOf(c.req.url);
    const sections = await buildMessageCatalog({
      appOrigin,
      timezone,
      reports: {
        clock: container.clock,
        publications: container.publications,
        incidents: container.dispatchJobs,
        posts: container.postRevisions,
        cron: container.systemState,
        publishing: container.publishing
      },
      analytics: { repo: container.contentAlerts, goals: container.contentGoals, clock: container.clock, timezone }
    });
    const { sent, error } = await sendMessageCatalog({
      messenger,
      chatId: c.get('actor').telegramId,
      intro: PREVIEW_INTRO,
      studioUrl: `${appOrigin}/`,
      sections
    });
    if (error !== null) {
      container.logger.warn({
        component: 'owner_notice',
        operation: 'message_previews',
        requestId: c.get('requestId'),
        errorCode: error instanceof GrammyError ? 'TELEGRAM_REJECTED' : 'TELEGRAM_RESULT_UNKNOWN'
      });
      throw new AppError('UNAVAILABLE', 'Telegram did not accept every preview', { sent: String(sent) });
    }
    return c.json(messagePreviewsResultSchema.parse({ sent }));
  })
  .get('/goals', async (c) => {
    const container = c.get('container');
    return c.json(
      contentGoalsSchema.parse(await readContentGoals({ repo: container.contentGoals, clock: container.clock }))
    );
  })
  .put(
    '/goals/:platform',
    validated('param', contentGoalParamsSchema),
    validated('json', contentGoalInputSchema),
    async (c) => {
      const container = c.get('container');
      const goals = await setContentGoal(
        { repo: container.contentGoals, clock: container.clock },
        { platform: c.req.valid('param').platform, target: c.req.valid('json').target }
      );
      return c.json(contentGoalsSchema.parse(goals));
    }
  )
  .delete('/goals/:platform', validated('param', contentGoalParamsSchema), async (c) => {
    const container = c.get('container');
    const goals = await removeContentGoal(
      { repo: container.contentGoals, clock: container.clock },
      c.req.valid('param').platform
    );
    return c.json(contentGoalsSchema.parse(goals));
  });
