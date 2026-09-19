import { describe, expect, it } from 'vitest';
import { createHttpClient } from 'src/lib/api';

/**
 * Транспорт передаём аргументом. Глобальный fetch здесь подменять нельзя: через него работает
 * и рантайм, и сам тестовый раннер — подмена вешает прогон (проверено, 17 минут).
 */
const transport = (responses: (() => Response)[]) => {
  const calls: string[] = [];

  const send = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return responses[Math.min(calls.length - 1, responses.length - 1)]!();
  }) as typeof globalThis.fetch;

  return { send, calls };
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('HTTP-клиент внешних сервисов', () => {
  it('повторяет 429 и отдаёт успешный ответ', async () => {
    const { send, calls } = transport([() => json(429, { ok: false }), () => json(200, { result: 'готово' })]);

    const result = await createHttpClient('https://x.test', { fetch: send }).post<{ result: string }>('m', {});

    expect(result.result).toBe('готово');
    expect(calls).toHaveLength(2);
  });

  it('повторяет 5xx в пределах лимита и отдаёт последний ответ', async () => {
    const { send, calls } = transport([() => json(500, { description: 'boom' })]);

    const result = await createHttpClient('https://x.test', { retries: 2, fetch: send }).post<{
      description: string;
    }>('m', {});

    // Три попытки: первая и два повтора. Дальше не долбим — повтор маскировал бы поломку.
    expect(calls).toHaveLength(3);
    expect(result.description).toBe('boom');
  });

  it('НЕ повторяет 400: ошибка сервиса детерминирована', async () => {
    const { send, calls } = transport([() => json(400, { description: 'Bad Request' })]);

    await createHttpClient('https://x.test', { fetch: send }).post('m', {});

    expect(calls).toHaveLength(1);
  });

  it('сетевой сбой повторяет и в конце бросает retryable-ошибку', async () => {
    const calls: string[] = [];
    const send = (async () => {
      calls.push('x');
      throw Object.assign(new Error('network'), { name: 'TypeError' });
    }) as typeof globalThis.fetch;

    await expect(createHttpClient('https://x.test', { retries: 1, fetch: send }).post('m', {})).rejects.toMatchObject({
      code: 'upstream_failed',
      retryable: true,
    });

    expect(calls).toHaveLength(2);
  });
});
