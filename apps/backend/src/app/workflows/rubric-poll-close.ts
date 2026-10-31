import type { SlotRow } from '../../modules/rubric-scheduler';
import type { Container } from '../container';

// A `poll_close` slot (area-backend-core §11.2): the scheduler closes its channel poll with stopPoll at the poll's time
// (24 h, 7 days for quizzes and bets). Telegram's answer is the final count: kept with the audience module and the slot.
// «Already closed» and «not found» end the slot quietly; a refusal or an unclear answer tries again in ten minutes.

const RETRY_MS = 10 * 60_000;

export async function closePoll(
  container: Pick<Container, 'pollStopper' | 'audience' | 'rubricSlots'>,
  slot: SlotRow,
  now: number
): Promise<void> {
  const facts = slot.facts ?? {};
  const chatId = typeof facts['chatId'] === 'string' ? facts['chatId'] : null;
  const messageId = typeof facts['messageId'] === 'number' ? facts['messageId'] : null;
  const pollId = typeof facts['pollId'] === 'string' ? facts['pollId'] : null;
  if (chatId === null || messageId === null) {
    await container.rubricSlots.transition({
      id: slot.id,
      from: slot.status,
      to: 'skipped',
      now,
      set: { errorCode: 'NO_POLL_MESSAGE' }
    });
    return;
  }
  const outcome = await container.pollStopper.stop({ chatId, messageId });
  if (outcome.kind === 'closed') {
    if (pollId !== null)
      await container.audience
        .recordFinalPoll({ pollId, voters: outcome.total, optionsJson: JSON.stringify(outcome.options), now })
        .catch(() => undefined);
    await container.rubricSlots.transition({
      id: slot.id,
      from: slot.status,
      to: 'sent',
      now,
      set: { sentAt: now, facts: { ...facts, total: outcome.total, options: outcome.options } }
    });
    return;
  }
  if (outcome.kind === 'already_closed' || outcome.kind === 'not_found') {
    await container.rubricSlots.transition({
      id: slot.id,
      from: slot.status,
      to: outcome.kind === 'already_closed' ? 'sent' : 'skipped',
      now,
      set: { errorCode: outcome.kind === 'already_closed' ? null : 'POLL_NOT_FOUND' }
    });
    return;
  }
  await container.rubricSlots.transition({
    id: slot.id,
    from: slot.status,
    to: slot.status,
    now,
    set: {
      nextActionAt: now + (outcome.kind === 'rate_limited' ? outcome.retryAfterSec * 1000 : RETRY_MS),
      errorCode: outcome.kind === 'rate_limited' ? 'RATE_LIMITED' : outcome.reason
    }
  });
}
