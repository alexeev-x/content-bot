import { GrammyError } from 'grammy';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { LogEvent } from '../../platform/logging/logger';
import { createTelegramCaller } from './telegram-call';

function setup(timeoutMs = 1_000) {
  const events: LogEvent[] = [];
  const logger = { info: () => {}, warn: (e: LogEvent) => events.push(e), error: (e: LogEvent) => events.push(e) };
  return { events, caller: createTelegramCaller({ logger, requestId: 'req-1', timeoutMs }) };
}

const refuse = () =>
  Promise.reject(
    new GrammyError(
      'x',
      {
        ok: false,
        error_code: 400,
        description: 'Not Found: /bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw9/x',
        parameters: {}
      },
      'm',
      {}
    )
  );

const hang = (signal: AbortSignal) =>
  new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted: secret-ish text')));
  });

describe('createTelegramCaller', () => {
  it('turns a deadline into a 503 with the stable code "timeout"', async () => {
    const { caller, events } = setup(10);
    await expect(caller.act('op', hang)).rejects.toMatchObject({ code: 'UNAVAILABLE', status: 503 });
    expect(events).toMatchObject([
      { component: 'telegram', operation: 'op', requestId: 'req-1', status: 503, errorCode: 'timeout' }
    ]);
    expect(JSON.stringify(events)).not.toContain('secret-ish');
  });

  it('logs a Telegram refusal description with the token redacted', async () => {
    const { caller, events } = setup();
    await expect(caller.act('op', refuse)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(JSON.stringify(events)).not.toContain('AAHdqTcv');
    expect(events[0]?.detail).toContain('HTTP 400');
    expect(events[0]?.errorCode).toBe('telegram_http_400');
  });

  it('rejects an answer that does not match the schema', async () => {
    const { caller } = setup();
    await expect(
      caller.read('op', () => Promise.resolve({ nope: 1 }), z.object({ url: z.string() }))
    ).rejects.toMatchObject({
      code: 'UNAVAILABLE'
    });
  });
});
