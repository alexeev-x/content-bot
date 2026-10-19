import { writeAnalyticsReview } from '../../modules/ai';
import { dailyReviewInput, type DailyReview, releaseDailyReport } from '../../modules/content-analytics';
import { getOwnerOperationsSettings } from '../../modules/settings';
import { AppError } from '../../shared/app-error';
import type { Container } from '../container';
import { sendBudgetAlerts } from './run-ai-reviews';

// The AI review of a stored daily report (AI plan P6), run by the AI_JOBS consumer: the model explains the stored
// numbers, then the report is released with the review or with the reason it has none. Never throws: a failure
// releases the numbers alone (the Cron fallback does the same for a job that never ran).

/** A reasoning model at its default effort, as for the owner's scripts: quality over speed (owner, 19.10.2026). */
const REVIEW_TIMEOUT_MS = 120_000;

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
  const input = await dailyReviewInput(reports, reportId);
  if (input === null) return;
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
}
