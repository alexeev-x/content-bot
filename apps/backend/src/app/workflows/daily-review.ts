import { writeAnalyticsReview } from '../../modules/ai';
import { dailyReviewInput, type DailyReview, releaseDailyReport } from '../../modules/content-analytics';
import { getOwnerOperationsSettings } from '../../modules/settings';
import { AppError } from '../../shared/app-error';
import type { Container } from '../container';
import { runRuleConsolidation } from './rule-consolidation';
import { sendBudgetAlerts } from './run-ai-reviews';

// The AI review of a stored daily report (AI plan P6), run by the AI_JOBS consumer: the model explains the stored
// numbers, then the report is released with the review or with the reason it has none. Never throws: a failure
// releases the numbers alone (the Cron fallback does the same for a job that never ran).

/** A reasoning model at its default effort, as for the owner's scripts: quality over speed (owner, 19.10.2026). */
const REVIEW_TIMEOUT_MS = 120_000;

/** The script's opening the analyst judges a hook by: about the first three sentences. */
const SCRIPT_OPENING_MAX = 400;

/**
 * The opening of the script each video was filmed from, where the owner confirmed the link in the studio (an
 * unconfirmed candidate could be another video's script). Owner, 19.10.2026: the review should see the hook.
 */
async function scriptLines(container: Container, items: readonly { key: string; itemId: string }[]): Promise<string[]> {
  const lines: string[] = [];
  for (const item of items) {
    const script = await container.aiScriptLinks.linkOf(item.itemId);
    if (script === null) continue;
    const opening = Array.from(script.text.replace(/\s+/g, ' ').trim()).slice(0, SCRIPT_OPENING_MAX).join('');
    lines.push(`${item.key} сценарий (подтверждён автором), начало: «${opening}»`);
  }
  return lines;
}

/** «AI_DISABLED», «AI_BUDGET»… from the gate's reason; the report says it in words. */
function unavailableCode(error: AppError): string {
  const reason = error.details?.reason;
  return typeof reason === 'string' ? `AI_${reason}` : 'AI_UNAVAILABLE';
}

export async function runDailyReview(
  reportId: string,
  container: Container,
  requestId: string,
  onError: (error: unknown) => void
): Promise<void> {
  const reports = container.contentDailyReports;
  const found = await dailyReviewInput(reports, reportId);
  if (found === null) return;
  const scripts = await scriptLines(container, found.items);
  const input = {
    facts: scripts.length === 0 ? found.facts : `${found.facts}\n\nСценарии:\n${scripts.join('\n')}`,
    videos: found.videos,
    period: found.period
  };
  let review: DailyReview | null = null;
  let reviewError: string | null = null;
  let model: string | null = null;
  try {
    const { timezone } = await getOwnerOperationsSettings({
      repo: container.settings,
      logger: container.logger,
      requestId
    });
    const result = await writeAnalyticsReview(
      {
        repo: container.aiRepository,
        clock: container.clock,
        timezone,
        newId: container.newId,
        provider: container.aiProvider
      },
      { ...input, signal: AbortSignal.timeout(REVIEW_TIMEOUT_MS) }
    );
    review = result.review;
    reviewError = result.errorCode;
    model = result.model;
    await sendBudgetAlerts(
      {
        messenger: container.ownerMessenger,
        ownerChatId: container.ownerChatId,
        readAppOrigin: () => container.systemState.readAppOrigin(),
        charge: () => {},
        logger: container.logger
      },
      result.budgetEvents
    );
  } catch (error) {
    if (error instanceof AppError && error.code === 'UNAVAILABLE') reviewError = unavailableCode(error);
    else {
      onError(error);
      reviewError = 'AI_FAILED';
    }
  }
  await releaseDailyReport(
    { reports, alerts: container.contentAlerts, now: container.clock.now() },
    { id: reportId, review, reviewError, model }
  );
  // Once a week, after the report is out: the analysis rules are weighed against the new results (AI plan P7).
  if (found.period === 'week') await runRuleConsolidation(reportId, container, requestId, onError);
}
