import { learnFromEdits, type LessonRow } from '../../modules/ai';
import type { NewContentAlert } from '../../modules/content-analytics';
import { getOwnerOperationsSettings } from '../../modules/settings';
import { AppError } from '../../shared/app-error';
import type { Container } from '../container';
import { escapeHtml } from '../notifications/notice-template';
import { sendBudgetAlerts } from './run-ai-reviews';

// The style-lesson job of the AI_JOBS consumer (AI plan P7c): the owner's new edits and remarks are read, and
// each lesson ready to ask is put to the owner once through the content alerts (one attempt, `unknown` never
// resent). Its buttons are `sp:<id>:ok` and `sp:<id>:no` (app/bot/ai-rules.ts). Never throws: a failure leaves
// the edits unread for the next run.

const LEARN_TIMEOUT_MS = 5 * 60_000;

const SCOPE_LABEL: Record<LessonRow['scope'], string> = {
  telegram: 'постах',
  fidit: '«Учу фидить»',
  igrat: '«Учусь играть»',
  standalone: 'рилсах вне рубрик'
};

export function lessonAlert(lesson: LessonRow): NewContentAlert {
  return {
    id: `style:${lesson.id}`,
    kind: 'item',
    title: 'Как вы правите',
    body: lesson.text,
    html: [
      lesson.origin === 'analytics'
        ? `💡 <b>Аналитика подтверждает</b> для ${SCOPE_LABEL[lesson.scope]}:`
        : lesson.fromRemark
          ? `✍️ <b>Понял из вашего замечания</b> (${SCOPE_LABEL[lesson.scope]}):`
          : `✍️ <b>Похоже, вы всегда так правите</b> в ${SCOPE_LABEL[lesson.scope]}:`,
      `«${escapeHtml(lesson.text)}»`,
      'Учитывать в новых текстах?'
    ].join('\n'),
    buttons: [
      { text: '✅ Учитывать', callbackData: `sp:${lesson.id}:ok` },
      { text: 'Нет', callbackData: `sp:${lesson.id}:no` }
    ],
    linkPath: '/settings/ai'
  };
}

export async function runStyleLessons(
  container: Container,
  requestId: string,
  onError: (error: unknown) => void
): Promise<void> {
  try {
    const { timezone } = await getOwnerOperationsSettings({
      repo: container.settings,
      logger: container.logger,
      requestId
    });
    const run = await learnFromEdits(
      {
        repo: container.aiRepository,
        lessons: container.aiStyleLessons,
        clock: container.clock,
        timezone,
        newId: container.newId,
        provider: container.aiProvider
      },
      { signal: AbortSignal.timeout(LEARN_TIMEOUT_MS) }
    );
    container.logger.info({
      component: 'ai_style_lessons',
      operation: 'learn',
      requestId,
      status: run.errorCode === null ? 'ok' : 'partial',
      errorCode: run.errorCode ?? undefined,
      counts: { read: run.read, learned: run.learned, toAsk: run.toAsk.length }
    });
    const now = container.clock.now();
    // The alert first (its id dedups a repeat), then the mark: a lost mark asks once more, never twice at once.
    for (const lesson of run.toAsk) {
      await container.contentAlerts.insert([lessonAlert(lesson)], now);
      await container.aiStyleLessons.markAsked(lesson.id, now);
    }
    await sendBudgetAlerts(
      {
        messenger: container.ownerMessenger,
        ownerChatId: container.ownerChatId,
        readAppOrigin: () => container.systemState.readAppOrigin(),
        charge: () => {},
        logger: container.logger
      },
      run.budgetEvents
    );
  } catch (error) {
    // AI off or out of budget is the owner's switch, not a failure.
    if (!(error instanceof AppError && error.code === 'UNAVAILABLE')) onError(error);
  }
}
