import { ACTIVE_HYPOTHESES_MAX, hypothesisLines, writeAnalyticsReview } from '../../modules/ai';
import { dailyReviewInput, type DailyReview, releaseDailyReport, videoTitleKey } from '../../modules/content-analytics';
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
 * The opening of the script each video was filmed from (owner, 19.10.2026: the review should see the hook), said
 * as the owner's link or as the automatic match by title, never the one passed off as the other (review 19.10.2026).
 */
async function scriptLines(container: Container, items: readonly { key: string; itemId: string }[]): Promise<string[]> {
  const lines: string[] = [];
  for (const item of items) {
    const script = await container.aiScriptLinks.linkOf(item.itemId);
    if (script === null) continue;
    const opening = Array.from(script.text.replace(/\s+/g, ' ').trim()).slice(0, SCRIPT_OPENING_MAX).join('');
    const origin = script.confirmed === true ? 'подтверждён автором' : 'привязан автоматически по названию';
    lines.push(`${item.key} сценарий (${origin}), начало: «${opening}»`);
  }
  return lines;
}

/** The report's videos that have no short name yet, one per title key, as N1… for the review to name. */
async function unnamedVideos(
  container: Container,
  titles: readonly string[]
): Promise<{ videos: { id: string; key: string; title: string }[]; taken: string[] }> {
  const byKey = new Map<string, string>();
  for (const title of titles) {
    const key = videoTitleKey(title);
    if (key !== '' && !byKey.has(key)) byKey.set(key, title);
  }
  const named = await container.contentVideoNames.read([...byKey.keys()]);
  return {
    videos: [...byKey.entries()]
      .filter(([key]) => !named.has(key))
      .map(([key, title], index) => ({ id: `N${index + 1}`, key, title })),
    // The report's other videos keep their names: a new one may not take one of them.
    taken: [...named.values()]
  };
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
  // The day sees the analyst's open hypotheses (owner, 20.10.2026: «запоминает»); the week's job, at 48 of its 50
  // D1 statements, does not read them: Monday's own hypotheses job weighs them after this one.
  const active = found.period === 'day' ? await container.aiHypotheses.active(ACTIVE_HYPOTHESES_MAX) : [];
  const hypotheses = hypothesisLines(active);
  // Compared here, not in SQL: SQLite's lower() leaves Cyrillic as it is.
  const known = new Set(active.map((row) => row.text.trim().toLowerCase()));
  const facts = [
    found.facts,
    scripts.length === 0 ? null : `Сценарии:\n${scripts.join('\n')}`,
    hypotheses.length === 0 ? null : `Гипотезы:\n${hypotheses.join('\n')}`
  ]
    .filter((part) => part !== null)
    .join('\n\n');
  // The videos without a short name yet are named by the same call (owner, 22.10.2026); a failed read only leaves
  // them unnamed today.
  const { videos: naming, taken } = await unnamedVideos(container, found.titles).catch((error: unknown) => {
    onError(error);
    return { videos: [], taken: [] };
  });
  const input = {
    facts,
    videos: found.videos,
    period: found.period,
    naming: naming.map(({ id, title }) => ({ id, title })),
    taken
  };
  let review: DailyReview | null = null;
  let reviewError: string | null = null;
  let model: string | null = null;
  let usageId: string | null = null;
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
    if (result.names.length > 0)
      await container.contentVideoNames
        .saveAi(
          result.names.flatMap(({ id, name }) => {
            const key = naming.find((video) => video.id === id)?.key;
            return key === undefined ? [] : [{ key, name }];
          }),
          container.clock.now()
        )
        .catch(onError);
    model = result.model;
    usageId = result.usageId;
    const proposed = result.review?.hypothesis;
    let raised = false;
    if (proposed !== undefined && proposed.text.length >= 3 && !known.has(proposed.text.trim().toLowerCase())) {
      // A failed insert loses the hypothesis, never the written review or its budget notices (review 20.10.2026).
      try {
        // Null when nothing was stored (twelve open already, the same text, a lost race): no news then.
        raised =
          (await container.aiHypotheses.create({
            id: container.newId(),
            text: proposed.text,
            scope: proposed.scope,
            kind: proposed.kind,
            confidence: 'low',
            sourceRef: reportId,
            now: container.clock.now()
          })) !== null;
      } catch (error) {
        onError(error);
      }
    }
    // The message says «Новая гипотеза» only for one really kept; a repeat or a failed insert is not news.
    if (!raised && review !== null && 'hypothesis' in review) {
      const { hypothesis: _notRaised, ...rest } = review;
      review = rest;
    }
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
    { reports, alerts: container.contentAlerts, names: container.contentVideoNames, now: container.clock.now() },
    { id: reportId, review, reviewError, model, usageId }
  );
  // Once a week, after the report is out: the analysis rules are weighed against the new results (AI plan P7).
  if (found.period === 'week') {
    await runRuleConsolidation(reportId, container, requestId, onError);
    // Then the analyst's hypotheses, in a job of their own: this one has no D1 statements left for them.
    try {
      await container.aiJobs.send({ id: crypto.randomUUID(), kind: 'hypotheses', reportId });
    } catch (error) {
      // Not queued: the hypotheses wait for next Monday as they are.
      onError(error);
    }
  }
}
