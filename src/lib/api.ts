import { AppError } from './errors';
import { logger } from './logger';

type ClientOptions = {
  /** Сколько ждать ответ. Зависший вызов не должен держать обработчик до его таймаута. */
  timeoutMs?: number;
  /** Сколько раз повторить при сетевом сбое. Ответы сервиса не повторяем: они детерминированы. */
  retries?: number;
  /**
   * Транспорт. Подменяется в тестах: глобальный fetch подменять нельзя — через него работает
   * и сам рантайм, и тестовый раннер, и подмена вешает прогон.
   */
  fetch?: typeof globalThis.fetch;
};

const isNetworkFailure = (error: unknown) =>
  error instanceof Error &&
  (error.name === 'TimeoutError' || error.name === 'AbortError' || error.name === 'TypeError');

/** 429 и 5xx — временные: сервис жив, но сейчас не может. Остальные коды повторять бессмысленно. */
const isTransientStatus = (status: number) => status === 429 || status >= 500;

/** Площадки просят подождать конкретное время — уважаем, но не дольше разумного. */
const retryDelayMs = (response: globalThis.Response, attempt: number) => {
  const header = Number(response.headers.get('retry-after'));
  const requested = Number.isFinite(header) ? header * 1000 : 0;
  return Math.min(Math.max(requested, 300 * (attempt + 1)), 10_000);
};

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * Базовый клиент внешнего сервиса: таймаут, повтор сетевого сбоя, единый формат ошибки.
 * Домена не знает — поверх него строятся клиенты в core (Telegram, ИИ, площадки).
 */
export const createHttpClient = (
  baseUrl: string,
  { timeoutMs = 15_000, retries = 2, fetch: send = globalThis.fetch }: ClientOptions = {},
) => ({
  post: async <T>(path: string, body: unknown): Promise<T> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await send(`${baseUrl}/${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (isTransientStatus(response.status) && attempt < retries) {
          const delay = retryDelayMs(response, attempt);
          logger.warn('upstream retry', { path, status: response.status, attempt: attempt + 1, delay });
          await wait(delay);
          continue;
        }

        return (await response.json()) as T;
      } catch (error) {
        if (!isNetworkFailure(error) || attempt >= retries) {
          throw new AppError('upstream_failed', `Request to ${path} failed`, { retryable: true, cause: error });
        }

        logger.warn('upstream retry', { path, attempt: attempt + 1 });
        await wait(300 * (attempt + 1));
      }
    }
  },
});
