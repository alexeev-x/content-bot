import { aiOverviewSchema, updateAiSettingsInputSchema } from '@alexeev/contracts';
import { type Context, Hono } from 'hono';
import { type BudgetEvent, checkAiConnection, readAiOverview, updateAiSettings } from '../modules/ai';
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

async function deps(c: Context<AppBindings>) {
  const container = c.get('container');
  const { timezone } = await getOwnerOperationsSettings({
    repo: container.settings,
    logger: container.logger,
    requestId: c.get('requestId')
  });
  return {
    repo: container.aiRepository,
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
  });
