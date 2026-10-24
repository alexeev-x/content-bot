import { type HypothesisChange, type LessonRow, reviewHypotheses } from '../../modules/ai';
import { type NewContentAlert, storedReportFacts } from '../../modules/content-analytics';
import { getOwnerOperationsSettings } from '../../modules/settings';
import { AppError } from '../../shared/app-error';
import type { Container } from '../container';
import { escapeHtml } from '../notifications/notice-template';
import { sendBudgetAlerts } from './run-ai-reviews';
import { lessonAlert } from './style-lessons';

// The Monday job of the AI_JOBS consumer after the week's report (owner, 20.10.2026: the analyst «запоминает»): the
// open hypotheses are weighed against the week's numbers, the owner gets one message with what changed, and each
// writing hypothesis that became supported is put to the owner as a style lesson — only «Учитывать» makes it a rule.
// Never throws: a failure leaves the hypotheses as they were until next Monday.

const REVIEW_TIMEOUT_MS = 120_000;
/** Questions one Monday may raise: the owner answers a couple, not a wall of them. */
const QUESTIONS_MAX = 2;

const STATUS_LINE = {
  open: '🔎 пока открыта',
  supported: '✅ подтверждается',
  refuted: '❌ не подтвердилась'
} as const;

/** Telegram takes 4096 characters; the rest of the list is in the studio. */
const ALERT_MAX = 3600;
const LINE_TEXT_MAX = 180;
const LINE_NOTE_MAX = 200;

const clip = (value: string, max: number) => {
  const letters = Array.from(value);
  return letters.length <= max ? value : `${letters.slice(0, max - 1).join('')}…`;
};

/**
 * The Monday message: only the hypotheses whose status changed (review 20.10.2026: sixteen unchanged lines would
 * pass Telegram's 4096 and the whole message would fail), each clipped, and cut with «…и ещё N» before the limit.
 */
export function hypothesesAlert(reportId: string, changes: readonly HypothesisChange[]): NewContentAlert | null {
  const changed = changes.filter((change) => change.status !== change.row.status);
  if (changed.length === 0) return null;
  const header = '🧪 <b>Гипотезы недели</b>';
  const lines: string[] = [];
  let length = Array.from(header).length;
  for (const change of changed) {
    const line = `<b>H${change.row.code}</b> ${STATUS_LINE[change.status]}: ${escapeHtml(clip(change.row.text, LINE_TEXT_MAX))}\n<i>${escapeHtml(clip(change.note, LINE_NOTE_MAX))}</i>`;
    if (length + Array.from(line).length + 2 > ALERT_MAX) {
      lines.push(`…и ещё ${changed.length - lines.length} — в Студии, «Гипотезы аналитики».`);
      break;
    }
    lines.push(line);
    length += Array.from(line).length + 2;
  }
  return {
    id: `hypotheses:${reportId}`,
    kind: 'digest',
    title: 'Гипотезы недели',
    body: `Изменилось гипотез: ${changed.length}`,
    html: [header, ...lines].join('\n\n'),
    buttons: [],
    linkPath: '/settings/ai'
  };
}

export async function runHypothesesReview(
  reportId: string,
  container: Container,
  requestId: string,
  onError: (error: unknown) => void
): Promise<void> {
  try {
    const facts = await storedReportFacts(container.contentDailyReports, reportId);
    if (facts === null) return;
    const { timezone } = await getOwnerOperationsSettings({
      repo: container.settings,
      logger: container.logger,
      requestId
    });
    const result = await reviewHypotheses(
      {
        repo: container.aiRepository,
        hypotheses: container.aiHypotheses,
        clock: container.clock,
        timezone,
        newId: container.newId,
        provider: container.aiProvider
      },
      { facts, sourceRef: reportId, signal: AbortSignal.timeout(REVIEW_TIMEOUT_MS) }
    );
    container.logger.info({
      component: 'ai_hypotheses',
      operation: 'review',
      requestId,
      status: result.errorCode === null ? 'ok' : 'skipped',
      errorCode: result.errorCode ?? undefined,
      counts: { changed: result.changes.length, supported: result.newlySupported.length }
    });
    const now = container.clock.now();
    // The alert's id dedups a redelivered job; the questions go out with it through the content alerts.
    const digest = hypothesesAlert(reportId, result.changes);
    if (digest !== null) await container.contentAlerts.insert([digest], now);
    for (const row of result.newlySupported.slice(0, QUESTIONS_MAX)) {
      const lessonId = container.newId();
      if (!(await container.aiHypotheses.askAsLesson({ hypothesisId: row.id, lessonId, now }))) continue;
      const lesson: LessonRow = {
        id: lessonId,
        text: row.text,
        scope: row.scope,
        status: 'asked',
        fromRemark: false,
        origin: 'analytics',
        ruleId: null,
        drafts: 0,
        createdAt: now
      };
      await container.contentAlerts.insert([lessonAlert(lesson)], now);
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
    // AI off or out of budget is the owner's switch, not a failure.
    if (!(error instanceof AppError && error.code === 'UNAVAILABLE')) onError(error);
  }
}
