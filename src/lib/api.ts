import { AppError, isAppError } from './errors';

type ClientOptions = {
  timeoutMs?: number;
  retries?: number;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
  headers?: HeadersInit;
};

/** Повтор POST разрешён только при гарантии идемпотентности со стороны вызывающего кода. */
export const createHttpClient = (
  baseUrl: string,
  { timeoutMs = 15_000, retries = 2, fetch: send = globalThis.fetch, signal, headers }: ClientOptions = {},
) => ({
  post: async (path: string, body: unknown, { idempotent = false } = {}): Promise<unknown> => {
    const serialized = JSON.stringify(body);
    for (let attempt = 0; ; attempt += 1) {
      signal?.throwIfAborted();
      try {
        const response = await send(`${baseUrl}/${path}`, {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: serialized,
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
        });
        if (response.status >= 500) {
          await response.body?.cancel();
          throw new AppError(idempotent ? 'upstream_failed' : 'outcome_unknown', 'Upstream result is unavailable', {
            retryable: idempotent,
          });
        }
        if (response.status === 429 && idempotent) {
          const raw = response.headers.get('retry-after');
          const seconds = raw === null ? NaN : Number(raw);
          const delay = Number.isFinite(seconds) ? seconds * 1000 : Math.max(0, Date.parse(raw ?? '') - Date.now());
          await response.body?.cancel();
          throw new AppError('upstream_failed', 'Upstream rate limit', {
            retryable: true,
            retryAfterMs: Number.isFinite(delay) ? delay : 0,
          });
        }
        return (await response.json()) as unknown;
      } catch (cause) {
        const error = isAppError(cause)
          ? cause
          : new AppError(idempotent ? 'upstream_failed' : 'outcome_unknown', 'Upstream result is unavailable', {
              retryable: idempotent,
              cause,
            });
        if (!idempotent || !error.retryable || error.retryAfterMs > 1000 || attempt >= retries || signal?.aborted)
          throw error;
        await new Promise((done) => setTimeout(done, Math.max(error.retryAfterMs, 100 * (attempt + 1))));
      }
    }
  },
});
