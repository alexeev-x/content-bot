import { mskParts } from '../../shared/msk-time';
import { AppError } from '../../shared/app-error';
import type { Container } from '../container';
import { notifyOwnerOfFailure } from '../notifications/failure-notice';
import { schedulerMode } from '../rubric-scheduler/runtime';

// The scheduler's notices to the owner (MASTER-PLAN §1): one per reason and Moscow day, at most six failures a day and
// then a single summary; the rehearsal's carry «[DEV]». Each says what failed in the owner's words (step, service,
// HTTP status and text come with the build's own error line).

const FAILURES_PER_DAY = 6;

export async function notifySchedulerFailure(
  container: Pick<
    Container,
    'clock' | 'rubricNotices' | 'schedulerEnv' | 'ownerMessenger' | 'ownerChatId' | 'systemState' | 'logger'
  >,
  input: { key: string; text: string; kind?: 'failure' | 'health' | 'bank' }
): Promise<void> {
  const now = container.clock.now();
  const day = mskParts(now).day;
  const kind = input.kind ?? 'failure';
  try {
    let text = input.text;
    if (!(await container.rubricNotices.claim({ key: input.key, mskDay: day, kind, now, cap: FAILURES_PER_DAY }))) {
      // Over the day's cap: one summary instead of the rest.
      if (
        kind !== 'failure' ||
        !(await container.rubricNotices.claim({ key: 'summary', mskDay: day, kind: 'summary', now, cap: 1 }))
      )
        return;
      text =
        'Рубрики: сегодня больше шести сбоев. Подробности — в разделе «Рубрики», остальные уведомления до завтра не придут.';
    }
    const prefix = schedulerMode(container.schedulerEnv) === 'rehearsal' ? '[DEV] ' : '';
    await notifyOwnerOfFailure(
      {
        messenger: container.ownerMessenger,
        ownerChatId: container.ownerChatId,
        state: container.systemState,
        clock: container.clock,
        logger: container.logger
      },
      {
        where: `${prefix}Рубрики`,
        error: new AppError('UNAVAILABLE', text.slice(0, 900), { reason: input.key.slice(0, 60) })
      }
    );
  } catch (error) {
    container.logger.warn({
      component: 'rubric-notices',
      operation: kind,
      status: 'failed',
      errorCode: error instanceof Error ? error.name : 'unknown'
    });
  }
}
