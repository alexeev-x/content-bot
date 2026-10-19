import {
  contentAnalyticsOverviewSchema,
  contentGoalInputSchema,
  contentGoalParamsSchema,
  contentGoalsSchema,
  contentItemContaminationInputSchema,
  contentItemDetailSchema,
  contentItemFormatInputSchema,
  contentItemIdSchema,
  contentItemsPageSchema,
  contentItemsQuerySchema,
  contentReportDetailSchema,
  contentReportParamsSchema,
  contentReportQuerySchema,
  contentReportSchema,
  contentReportsPageSchema,
  contentReportsQuerySchema,
  type ContentReportSummaryDto,
  tiktokConnectSchema
} from '@alexeev/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  collectContentAnalytics,
  listContentItems,
  listReports,
  readReport,
  type ReportSummary,
  readContentAnalyticsOverview,
  completeTikTokConnect,
  type ConnectResult,
  disconnectTikTok,
  readContentItem,
  readContentGoals,
  markContentItemContamination,
  markContentItemFormat,
  readCachedContentReport,
  removeContentGoal,
  setContentGoal,
  startTikTokConnect,
  TIKTOK_STATE_TTL_SEC
} from '../modules/content-analytics';
import { readUsageCosts } from '../modules/ai';
import { AppError } from '../shared/app-error';
import type { Container } from './container';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { rateLimitClientKey } from '../platform/rate-limit/client-key';
import type { AppBindings } from './env';
import { validated } from './validation';

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

/** A report's review cost comes from the AI module's usage ledger, joined here (modules never import each other). */
async function withCosts(container: Container, reports: readonly ReportSummary[]): Promise<ContentReportSummaryDto[]> {
  const ids = reports.flatMap((report) => (report.usageId === null ? [] : [report.usageId]));
  const costs = await readUsageCosts(container.aiRepository, ids);
  return reports.map((report) => ({
    id: report.id,
    kind: report.kind,
    asOf: new Date(report.asOf).toISOString(),
    timezone: report.timezone,
    status: report.status,
    reviewError: report.reviewError,
    model: report.model,
    costUsd: report.usageId === null ? null : (costs.get(report.usageId) ?? null)
  }));
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
        await readCachedContentReport(
          { repo: container.contentAnalytics, clock: container.clock },
          c.req.valid('query')
        )
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
  .get('/reports', validated('query', contentReportsQuerySchema), async (c) => {
    const container = c.get('container');
    const page = await listReports(container.contentDailyReports, c.req.valid('query').cursor);
    const items = await withCosts(container, page.items);
    return c.json(contentReportsPageSchema.parse({ items, nextCursor: page.nextCursor }));
  })
  .get('/reports/:id', validated('param', contentReportParamsSchema), async (c) => {
    const container = c.get('container');
    const detail = await readReport(
      { reports: container.contentDailyReports, forecasts: container.contentForecasts },
      c.req.valid('param').id
    );
    if (detail === null) throw new AppError('NOT_FOUND', 'Report not found');
    const [report] = await withCosts(container, [detail.summary]);
    const iso = (ms: number) => new Date(ms).toISOString();
    return c.json(
      contentReportDetailSchema.parse({
        report,
        text: detail.text,
        forecasts: detail.forecasts.map((row) => ({
          itemId: row.itemId,
          title: row.title,
          platform: row.platform,
          method: row.method,
          origin: iso(row.origin),
          horizonHours: row.hours,
          targetAt: iso(row.targetAt),
          expected: row.expected,
          low: row.low,
          high: row.high,
          fact: row.fact,
          outcome: row.outcome
        }))
      })
    );
  })
  .get('/items/:id', validated('param', itemParamsSchema), async (c) => {
    const container = c.get('container');
    return c.json(
      contentItemDetailSchema.parse(
        await readContentItem(
          // The format comes from the AI module's script links (consumer-owned port ItemFormats).
          { repo: container.contentAnalytics, clock: container.clock, formats: container.aiScriptLinks },
          c.req.valid('param').id
        )
      )
    );
  })
  .put(
    '/items/:id/format',
    validated('param', itemParamsSchema),
    validated('json', contentItemFormatInputSchema),
    async (c) => {
      const container = c.get('container');
      await markContentItemFormat(
        { repo: container.contentAnalytics, clock: container.clock },
        c.req.valid('param').id,
        c.req.valid('json').format
      );
      return c.body(null, 204);
    }
  )
  .put(
    '/items/:id/contamination',
    validated('param', itemParamsSchema),
    validated('json', contentItemContaminationInputSchema),
    async (c) => {
      const container = c.get('container');
      await markContentItemContamination(
        { repo: container.contentAnalytics, clock: container.clock },
        c.req.valid('param').id,
        c.req.valid('json').reason
      );
      return c.body(null, 204);
    }
  )
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
