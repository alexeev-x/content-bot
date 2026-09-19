import { describe, expect, it, vi } from 'vitest';
import { createHttpClient } from 'src/lib/api';

describe('безопасность повторов HTTP', () => {
  it('не повторяет POST после потери ответа: действие могло выполниться', async () => {
    const send = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('response lost'));
    await expect(createHttpClient('https://x.test', { fetch: send }).post('send', {})).rejects.toMatchObject({
      code: 'outcome_unknown',
      retryable: false,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('не повторяет изменяющий POST после 500', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 500 }));
    await expect(createHttpClient('https://x.test', { fetch: send }).post('send', {})).rejects.toMatchObject({
      code: 'outcome_unknown',
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('ограниченно повторяет запрос с явной гарантией идемпотентности', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValue(new Response('{"ok":true}'));
    await expect(
      createHttpClient('https://x.test', { fetch: send }).post('read', {}, { idempotent: true }),
    ).resolves.toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('не сокращает длинный Retry-After до короткого ожидания', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}', { status: 429, headers: { 'retry-after': '60' } }));
    await expect(
      createHttpClient('https://x.test', { fetch: send }).post('read', {}, { idempotent: true }),
    ).rejects.toMatchObject({ retryable: true, retryAfterMs: 60_000 });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('не повторяет 400', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"error":true}', { status: 400 }));
    await createHttpClient('https://x.test', { fetch: send }).post('read', {}, { idempotent: true });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
