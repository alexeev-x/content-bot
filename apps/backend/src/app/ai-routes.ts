import {
  aiAuthorProfileSchema,
  aiDotaSnapshotInputSchema,
  aiDraftResultSchema,
  aiItemScriptSchema,
  aiOverviewSchema,
  contentItemIdSchema,
  createAiDraftInputSchema,
  linkAiScriptInputSchema,
  updateAiAuthorProfileInputSchema,
  updateAiSettingsInputSchema
} from '@alexeev/contracts';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import {
  type BudgetEvent,
  checkAiConnection,
  generateDraft,
  linkItemScript,
  readAiOverview,
  readAuthorProfile,
  readItemScript,
  saveAuthorDota,
  unlinkItemScript,
  updateAiSettings,
  updateAuthorProfile
} from '../modules/ai';
import { readContentItem } from '../modules/content-analytics';
import { getOwnerOperationsSettings } from '../modules/settings';
import { appOriginOf } from './bot/app-origin';
import type { AppBindings } from './env';
import { formatAiBudgetAlert } from './notifications/ai-budget-alert';
import { rateLimit } from './rate-limit';
import { limitBody, validated } from './validation';

const MAX_BODY_BYTES = 8 * 1024;
const ALERT_TIMEOUT_MS = 5_000;
/** A check costs a fraction of a cent; a few per 10 minutes is plenty and bounds a stuck button or a loop. */
const CHECK_LIMIT = 5;
const CHECK_WINDOW_MS = 10 * 60 * 1000;
/**
 * A studio draft is a paid request, bounded against a loop. 20 per 10 minutes by default; dev sets AI_DRAFT_LIMIT
 * higher so a control run (20+ tasks) is not cut (owner, 16.10.2026). The money limits («Бюджет») still apply.
 */
const DRAFT_LIMIT = 20;
const DRAFT_LIMIT_MAX = 500;
const DRAFT_WINDOW_MS = 10 * 60 * 1000;
export const draftLimit = (env: { AI_DRAFT_LIMIT?: string }): number => {
  const value = Number(env.AI_DRAFT_LIMIT);
  return Number.isInteger(value) && value > 0 ? Math.min(value, DRAFT_LIMIT_MAX) : DRAFT_LIMIT;
};
/** A request from the studio has no Telegram deadline; the model still gets a bound. */
const DRAFT_TIMEOUT_MS = 60_000;
/** The studio sends a read when the last one is a day old: a handful per window is plenty. */
const DOTA_LIMIT = 10;
const DOTA_WINDOW_MS = 10 * 60 * 1000;

const scriptParamsSchema = z.strictObject({ itemId: contentItemIdSchema });

async function deps(c: Context<AppBindings>) {
  const container = c.get('container');
  const { timezone } = await getOwnerOperationsSettings({
    repo: container.settings,
    logger: container.logger,
    requestId: c.get('requestId')
  });
  return {
    repo: container.aiRepository,
    writer: container.aiWriter,
    clock: container.clock,
    timezone,
    keyConfigured: container.aiProvider !== null
  };
}

// Budget alerts go out after the answer; a failed send is logged, never retried (the owner sees the page too).
function sendBudgetAlerts(c: Context<AppBindings>, events: readonly BudgetEvent[]) {
  const container = c.get('container');
  const messenger = container.ownerMessenger;
  if (events.length === 0 || messenger === null) return;
  const url = new URL('/settings/ai', appOriginOf(c.req.url)).toString();
  const chatId = c.get('actor').telegramId;
  c.executionCtx.waitUntil(
    (async () => {
      for (const event of events) {
        try {
          await messenger.sendMessageWithWebAppButton(
            chatId,
            { html: formatAiBudgetAlert(event), button: { text: 'Открыть настройки ИИ', url } },
            AbortSignal.timeout(ALERT_TIMEOUT_MS)
          );
        } catch {
          container.logger.warn({
            component: 'ai',
            operation: 'budget_alert',
            requestId: c.get('requestId'),
            errorCode: 'TELEGRAM_SEND_FAILED'
          });
        }
      }
    })()
  );
}

export const aiRoutes = new Hono<AppBindings>()
  .get('/', async (c) => c.json(aiOverviewSchema.parse(await readAiOverview(await deps(c)))))
  .put('/settings', limitBody(MAX_BODY_BYTES), validated('json', updateAiSettingsInputSchema), async (c) => {
    const base = await deps(c);
    await updateAiSettings(base, c.req.valid('json'));
    return c.json(aiOverviewSchema.parse(await readAiOverview(base)));
  })
  .post('/check', rateLimit({ name: 'ai-check', limit: CHECK_LIMIT, windowMs: CHECK_WINDOW_MS }), async (c) => {
    const base = await deps(c);
    const container = c.get('container');
    const events = await checkAiConnection({ ...base, newId: container.newId, provider: container.aiProvider });
    sendBudgetAlerts(c, events);
    return c.json(aiOverviewSchema.parse(await readAiOverview(base)));
  })
  .post(
    '/drafts',
    rateLimit({ name: 'ai-draft', limit: draftLimit, windowMs: DRAFT_WINDOW_MS }),
    limitBody(MAX_BODY_BYTES),
    validated('json', createAiDraftInputSchema),
    async (c) => {
      const base = await deps(c);
      const container = c.get('container');
      const input = c.req.valid('json');
      const result = await generateDraft(
        { ...base, profiles: container.aiProfiles, newId: container.newId, provider: container.aiProvider },
        { ...input, source: 'studio', signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS) }
      );
      sendBudgetAlerts(c, result.budgetEvents);
      const { generation } = result;
      return c.json(
        aiDraftResultSchema.parse({
          generationId: generation.id,
          status:
            generation.status !== 'ready' ? 'failed' : generation.result === 'needs_facts' ? 'needs_facts' : 'ready',
          errorCode: generation.errorCode,
          model: generation.model,
          hooks: generation.result === 'needs_facts' ? [] : generation.hooks,
          text: result.text,
          question: generation.question,
          ideas: generation.ideas,
          warnings: generation.warnings
        })
      );
    }
  )
  .get('/profile', async (c) =>
    c.json(aiAuthorProfileSchema.parse(await readAuthorProfile(c.get('container').aiProfiles)))
  )
  .put('/profile', limitBody(MAX_BODY_BYTES), validated('json', updateAiAuthorProfileInputSchema), async (c) => {
    const container = c.get('container');
    await updateAuthorProfile({ repo: container.aiProfiles, clock: container.clock }, c.req.valid('json'));
    return c.json(aiAuthorProfileSchema.parse(await readAuthorProfile(container.aiProfiles)));
  })
  .post(
    '/profile/dota',
    rateLimit({ name: 'ai-dota', limit: DOTA_LIMIT, windowMs: DOTA_WINDOW_MS }),
    limitBody(MAX_BODY_BYTES),
    validated('json', aiDotaSnapshotInputSchema),
    async (c) => {
      const container = c.get('container');
      await saveAuthorDota({ repo: container.aiProfiles, clock: container.clock }, c.req.valid('json'));
      return c.json(aiAuthorProfileSchema.parse(await readAuthorProfile(container.aiProfiles)));
    }
  )
  .get('/scripts/:itemId', validated('param', scriptParamsSchema), async (c) => {
    const { links, video } = await scriptDeps(c, c.req.valid('param').itemId);
    return c.json(aiItemScriptSchema.parse(await readItemScript(links, video)));
  })
  .put(
    '/scripts/:itemId',
    limitBody(MAX_BODY_BYTES),
    validated('param', scriptParamsSchema),
    validated('json', linkAiScriptInputSchema),
    async (c) => {
      const { links, video } = await scriptDeps(c, c.req.valid('param').itemId);
      return c.json(aiItemScriptSchema.parse(await linkItemScript(links, video, c.req.valid('json').revisionId)));
    }
  )
  .delete('/scripts/:itemId', validated('param', scriptParamsSchema), async (c) => {
    const { links, video } = await scriptDeps(c, c.req.valid('param').itemId);
    return c.json(aiItemScriptSchema.parse(await unlinkItemScript(links, video)));
  });

/** The video from the analytics module (NOT_FOUND when it is not collected) and the links store. */
async function scriptDeps(c: Context<AppBindings>, itemId: string) {
  const container = c.get('container');
  const { item } = await readContentItem({ repo: container.contentAnalytics, clock: container.clock }, itemId);
  return {
    links: { links: container.aiScriptLinks, clock: container.clock },
    video: { id: item.id, platform: item.platform, title: item.title, publishedAt: Date.parse(item.publishedAt) }
  };
}
