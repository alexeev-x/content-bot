import { GrammyError } from 'grammy';
import { z } from 'zod';
import { boundDetail } from '../../../platform/error-detail';
import type { PollStopOutcome, PollStopper } from '../application/ports';
import { classifyTelegramError } from './classify-telegram-result';

// Closing a poll changes nothing a second time, so unlike a send it may be repeated: Telegram's «already closed» is an
// answer, not a failure. Every other refusal and every unclear answer is kept apart so the caller can decide.

const STOP_TIMEOUT_MS = 15_000;
const ALREADY_CLOSED = /poll has already been closed/i;
const NOT_FOUND = /message to stop poll not found|message not found|poll not found|chat not found/i;

const closedPollSchema = z.object({
  total_voter_count: z.number().int().nonnegative(),
  options: z.array(z.object({ text: z.string(), voter_count: z.number().int().nonnegative() }))
});

export function createTelegramPollStopper(api: {
  stopPoll(chatId: string, messageId: number, signal: AbortSignal): Promise<unknown>;
}): PollStopper {
  return {
    async stop({ chatId, messageId }): Promise<PollStopOutcome> {
      let answer: unknown;
      try {
        answer = await api.stopPoll(chatId, messageId, AbortSignal.timeout(STOP_TIMEOUT_MS));
      } catch (error) {
        if (error instanceof GrammyError && error.error_code === 400) {
          if (ALREADY_CLOSED.test(error.description)) return { kind: 'already_closed' };
          if (NOT_FOUND.test(error.description)) return { kind: 'not_found' };
          return { kind: 'unknown', reason: 'telegram_http_400', detail: boundDetail(error.description) };
        }
        const outcome = classifyTelegramError(error);
        if (outcome.kind === 'rate_limited' || outcome.kind === 'unknown') return outcome;
        // A refusal to close (bot no longer admin, token wrong) is the owner's to look at: it stays unclear here.
        return outcome.kind === 'rejected'
          ? {
              kind: 'unknown',
              reason: outcome.code,
              ...(outcome.detail === undefined ? {} : { detail: outcome.detail })
            }
          : { kind: 'unknown', reason: 'unexpected_answer' };
      }
      const poll = closedPollSchema.safeParse(answer);
      if (!poll.success) return { kind: 'unknown', reason: 'ok_without_poll' };
      return {
        kind: 'closed',
        total: poll.data.total_voter_count,
        options: poll.data.options.map((option) => ({ text: option.text, voters: option.voter_count }))
      };
    }
  };
}
