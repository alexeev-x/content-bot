import type { SendOutcome } from '../../modules/publishing';
import type { Container } from '../container';
import { rehearsalPace, schedulerMode } from './runtime';

/**
 * The week-long DEV test's staged Telegram failures (owner, 31.10.2026): for a rubric post whose slot drew one, the
 * dispatcher gets this answer instead of calling Telegram — once. Absent everywhere but that test, so production
 * always sends.
 */
export function rehearsalSendFault(
  container: Pick<Container, 'schedulerEnv' | 'rubricRehearsal'>
): ((postId: string) => Promise<SendOutcome | null>) | undefined {
  const env = container.schedulerEnv;
  if (rehearsalPace(env, schedulerMode(env)) === null) return undefined;
  return async (postId) => {
    const fault = await container.rubricRehearsal.telegramFault(postId);
    if (fault === null || !(await container.rubricRehearsal.fire(fault.slotId))) return null;
    switch (fault.scenario) {
      case 'tg_429':
        return { kind: 'rate_limited', retryAfterSec: 60 };
      case 'tg_timeout':
        return { kind: 'unknown', reason: 'rehearsal_timeout', detail: 'Репетиция: Telegram «не ответил» нарочно' };
      case 'tg_forbidden':
        return { kind: 'rejected', code: 'DESTINATION_UNAVAILABLE', detail: 'Репетиция: канал «недоступен» нарочно' };
      default:
        return null;
    }
  };
}
