import { GrammyError, HttpError } from 'grammy';
import type { z } from 'zod';
import type { Logger } from '../../platform/logging/logger';
import { AppError } from '../../shared/app-error';

export const BOT_CALL_TIMEOUT_MS = 8_000;
// Telegram caps retry_after far above what a person should wait for a button; the header stays sane.
const MAX_RETRY_AFTER_SEC = 3_600;

const unavailable = () => new AppError('UNAVAILABLE', 'Telegram is unavailable, try again');

// `failure` is only a stable code for the log: the Telegram description is never logged (it can echo
// the token path). Every Telegram failure is 503, never 401/403, which the client reads as "sign in again".
function classify(error: unknown, signal: AbortSignal): { error: AppError; failure: string } {
  if (signal.aborted) return { error: unavailable(), failure: 'timeout' };
  if (error instanceof GrammyError) {
    if (error.error_code === 429) {
      const wait = error.parameters.retry_after;
      const retryAfterSec = Math.min(MAX_RETRY_AFTER_SEC, Math.max(1, typeof wait === 'number' ? Math.ceil(wait) : 1));
      return {
        error: new AppError('RATE_LIMIT', 'Telegram asks to slow down', undefined, retryAfterSec),
        failure: 'telegram_http_429'
      };
    }
    return { error: unavailable(), failure: `telegram_http_${error.error_code}` };
  }
  if (error instanceof HttpError) return { error: unavailable(), failure: 'network_error' };
  return { error: unavailable(), failure: 'unexpected_error' };
}

export interface TelegramCaller {
  /** Runs one Telegram request with its own deadline and returns the answer parsed by `schema`. */
  read<T>(operation: string, run: (signal: AbortSignal) => Promise<unknown>, schema: z.ZodType<T>): Promise<T>;
  /** Runs one Telegram request whose answer is not used (grammY already threw on `ok: false`). */
  act(operation: string, run: (signal: AbortSignal) => Promise<unknown>): Promise<void>;
}

// Nothing is retried: the owner presses the button again, and every step sets the same values.
export function createTelegramCaller(deps: { logger: Logger; requestId?: string; timeoutMs?: number }): TelegramCaller {
  const { logger, requestId, timeoutMs = BOT_CALL_TIMEOUT_MS } = deps;

  async function call(operation: string, run: (signal: AbortSignal) => Promise<unknown>): Promise<unknown> {
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      return await run(signal);
    } catch (error) {
      const { error: mapped, failure } = classify(error, signal);
      logger.warn({
        component: 'telegram',
        operation,
        ...(requestId === undefined ? {} : { requestId }),
        status: mapped.status,
        errorCode: failure
      });
      throw mapped;
    }
  }

  return {
    async read(operation, run, schema) {
      const parsed = schema.safeParse(await call(operation, run));
      if (!parsed.success) {
        logger.warn({
          component: 'telegram',
          operation,
          ...(requestId === undefined ? {} : { requestId }),
          status: 503,
          errorCode: 'unexpected_shape'
        });
        throw new AppError('UNAVAILABLE', 'Telegram answered in an unexpected shape');
      }
      return parsed.data;
    },
    async act(operation, run) {
      await call(operation, run);
    }
  };
}
