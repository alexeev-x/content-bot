import type { TelegramOwnerMessageApi } from '../../integrations/telegram/telegram-api';
import { type BudgetEvent, type ReviewDeps, runVideoReviews } from '../../modules/ai';
import type { Logger } from '../../platform/logging/logger';
import { formatAiBudgetAlert } from '../notifications/ai-budget-alert';

const ALERT_TIMEOUT_MS = 5_000;

// The 72 h review step of the Cron (stage 5 of the AI plan). A paid call can cross a budget threshold; each
// threshold is claimed once in D1, so the owner is told here, best effort and never retried.
export async function runAiReviews(deps: {
  review: ReviewDeps;
  messenger: TelegramOwnerMessageApi | null;
  ownerChatId: string | null;
  readAppOrigin: () => Promise<string | null>;
  charge: (count: number) => void;
  logger: Logger;
}): Promise<{ enqueued: number; reopened: number; ready: number; limited: number; retry: number; lost: number }> {
  const { budgetEvents, ...counts } = await runVideoReviews(deps.review);
  await sendBudgetAlerts(deps, budgetEvents);
  return counts;
}

async function sendBudgetAlerts(
  deps: Pick<Parameters<typeof runAiReviews>[0], 'messenger' | 'ownerChatId' | 'readAppOrigin' | 'charge' | 'logger'>,
  events: readonly BudgetEvent[]
): Promise<void> {
  if (events.length === 0) return;
  const origin = deps.messenger === null || deps.ownerChatId === null ? null : await deps.readAppOrigin();
  for (const event of events) {
    if (deps.messenger === null || deps.ownerChatId === null || origin === null) {
      deps.logger.warn({ component: 'ai', operation: 'budget_alert', errorCode: 'ALERT_TARGET_MISSING' });
      return;
    }
    try {
      deps.charge(1);
      await deps.messenger.sendMessageWithWebAppButton(
        deps.ownerChatId,
        {
          html: formatAiBudgetAlert(event),
          button: { text: 'Открыть настройки ИИ', url: new URL('/settings/ai', origin).toString() }
        },
        AbortSignal.timeout(ALERT_TIMEOUT_MS)
      );
    } catch {
      deps.logger.warn({ component: 'ai', operation: 'budget_alert', errorCode: 'TELEGRAM_SEND_FAILED' });
    }
  }
}
