import { botStatusSchema } from '@alexeev/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectError } from '../helpers/expect-error';
import { apiError, networkError } from '../helpers/fake-chat-api';
import { type FakeBotAdminApi, type Failures, fakeBotAdminApi } from '../helpers/fake-bot-admin-api';
import {
  type Api,
  createApi,
  OWNER_ID,
  OWNER_TOKEN,
  resetDb,
  seedSession,
  START,
  TEST_BOT_TOKEN
} from '../helpers/harness';

const WEBHOOK_SECRET = 'hook-secret-PLACEHOLDER';
const BOT_INFO = JSON.stringify({ id: 1, is_bot: true, first_name: 'Bot', username: 'content_bot' });
const ORIGIN = 'https://studio.example.com';
const EXPECTED_URL = `${ORIGIN}/webhooks/telegram`;

let api: Api;
let telegram: FakeBotAdminApi;
let logLines: string[];

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 7 * 24 * 60 * 60 * 1000 });
  logLines = [];
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    logLines.push(String(line));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function use(
  script: { webhookInfo?: unknown; failures?: Failures } = {},
  options: Parameters<typeof createApi>[0] = {}
): void {
  telegram = fakeBotAdminApi(script);
  api = createApi({ botInfo: BOT_INFO, webhookSecret: WEBHOOK_SECRET, ...options, botAdminApi: telegram });
}

const status = (token: string | null = OWNER_TOKEN) => api.request(`${ORIGIN}/api/v1/bot/status`, { token });
const connect = (token: string | null = OWNER_TOKEN, json: unknown = {}) =>
  api.request(`${ORIGIN}/api/v1/bot/connect`, { method: 'POST', json, token });

async function parsed(response: Response) {
  expect(response.status).toBe(200);
  return botStatusSchema.parse(await response.json());
}

function startUpdate() {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      date: 1,
      chat: { id: Number(OWNER_ID), type: 'private', first_name: 'X' },
      from: { id: Number(OWNER_ID), is_bot: false, first_name: 'X' },
      text: '/start',
      entities: [{ type: 'bot_command', offset: 0, length: 6 }]
    }
  };
}

const NO_HOOK = { url: '', pending_update_count: 0 };

describe('GET /api/v1/bot/status', () => {
  it('names the missing settings and does not ask Telegram', async () => {
    use({}, { botToken: null, botInfo: 'not json', webhookSecret: undefined });
    const body = await parsed(await status());
    expect(body).toEqual({
      missing: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'BOT_INFO'],
      botUsername: null,
      expectedUrl: EXPECTED_URL,
      webhook: null
    });
    expect(telegram.calls).toEqual([]);
  });

  it('reports a malformed webhook secret as missing and does not ask Telegram', async () => {
    use({}, { webhookSecret: 'not valid!' });
    expect(await parsed(await status())).toMatchObject({ missing: ['TELEGRAM_WEBHOOK_SECRET'], webhook: null });
    expect(telegram.calls).toEqual([]);
  });

  it('keeps the bot username while only another setting is missing', async () => {
    use({}, { botToken: null });
    expect(await parsed(await status())).toMatchObject({ missing: ['TELEGRAM_BOT_TOKEN'], botUsername: 'content_bot' });
  });

  it('reports a webhook that points at this Worker', async () => {
    use({ webhookInfo: { url: EXPECTED_URL, pending_update_count: 3 } });
    expect(await parsed(await status())).toEqual({
      missing: [],
      botUsername: 'content_bot',
      expectedUrl: EXPECTED_URL,
      webhook: { url: EXPECTED_URL, pointsHere: true, pendingUpdateCount: 3, lastErrorAt: null, lastErrorMessage: null }
    });
    expect(telegram.calls).toEqual(['getWebhookInfo']);
  });

  it('reports a webhook that points elsewhere', async () => {
    use({ webhookInfo: { url: 'https://other.example.com/webhooks/telegram', pending_update_count: 0 } });
    expect((await parsed(await status())).webhook).toMatchObject({
      url: 'https://other.example.com/webhooks/telegram',
      pointsHere: false
    });
  });

  it('reports no webhook as a null url', async () => {
    use({ webhookInfo: NO_HOOK });
    expect((await parsed(await status())).webhook).toMatchObject({ url: null, pointsHere: false });
  });

  it('maps the last delivery error to an ISO time and keeps the message', async () => {
    use({
      webhookInfo: {
        url: EXPECTED_URL,
        pending_update_count: 1,
        last_error_date: 1_800_000_000,
        last_error_message: 'Wrong response from the webhook: 401 Unauthorized'
      }
    });
    expect((await parsed(await status())).webhook).toMatchObject({
      lastErrorAt: '2027-01-15T08:00:00.000Z',
      lastErrorMessage: 'Wrong response from the webhook: 401 Unauthorized'
    });
  });

  it('answers 503 when Telegram replies in an unexpected shape', async () => {
    use({ webhookInfo: { ok: true } });
    await expectError(await status(), 503, 'UNAVAILABLE');
  });

  it('answers 401 without a session and does not ask Telegram', async () => {
    use();
    await expectError(await status(null), 401, 'UNAUTHORIZED');
    expect(telegram.calls).toEqual([]);
  });

  it('answers 429 with Retry-After when Telegram asks to slow down', async () => {
    use({
      failures: {
        getWebhookInfo: () => {
          throw apiError(429, 'Too Many Requests: retry after 7', { retry_after: 7 });
        }
      }
    });
    const response = await status();
    await expectError(response, 429, 'RATE_LIMIT');
    expect(response.headers.get('retry-after')).toBe('7');
  });

  it('answers 503 on a network error, and a Telegram 401 is not a session error', async () => {
    use({
      failures: {
        getWebhookInfo: () => {
          throw networkError();
        }
      }
    });
    await expectError(await status(), 503, 'UNAVAILABLE');

    use({
      failures: {
        getWebhookInfo: () => {
          throw apiError(401, 'Unauthorized');
        }
      }
    });
    await expectError(await status(), 503, 'UNAVAILABLE');
  });
});

describe('POST /api/v1/bot/connect', () => {
  it('registers the webhook, clears stale commands, sets the owner chat and returns the fresh status', async () => {
    use({ webhookInfo: { url: EXPECTED_URL, pending_update_count: 0 } });
    const body = await parsed(await connect());

    expect(telegram.calls).toEqual([
      `setWebhook ${EXPECTED_URL}`,
      'deleteMyCommands default -',
      'deleteMyCommands all_private_chats -',
      'deleteMyCommands default ru',
      'deleteMyCommands all_private_chats ru',
      `deleteMyCommands chat ${OWNER_ID} ru`,
      `setChatCommands ${OWNER_ID} start`,
      `setChatMenuWebApp ${OWNER_ID} Студия ${ORIGIN}/`,
      'getWebhookInfo'
    ]);
    expect(telegram.sent[0]).toEqual({
      url: EXPECTED_URL,
      secretToken: WEBHOOK_SECRET,
      allowedUpdates: ['message', 'callback_query']
    });
    expect(telegram.sent[6]).toEqual([{ command: 'start', description: 'Открыть студию' }]);
    expect(telegram.calls.length).toBeLessThanOrEqual(10);
    expect(telegram.sent[5]).toEqual({ scope: { chatId: Number(OWNER_ID) }, languageCode: 'ru' });
    expect(body.webhook?.pointsHere).toBe(true);
  });

  it('is safe to repeat: the second press sets the same values', async () => {
    use({ webhookInfo: { url: EXPECTED_URL, pending_update_count: 0 } });
    await connect();
    const first = [...telegram.calls];
    await connect();
    expect(telegram.calls).toEqual([...first, ...first]);
  });

  it('answers 503 BOT_NOT_CONFIGURED without calling Telegram when a setting is missing', async () => {
    use({}, { webhookSecret: undefined });
    await expectError(await connect(), 503, 'UNAVAILABLE', { reason: 'BOT_NOT_CONFIGURED' });
    expect(telegram.calls).toEqual([]);
  });

  it('answers 503 BOT_NOT_CONFIGURED for a malformed webhook secret', async () => {
    use({}, { webhookSecret: 'not valid!' });
    await expectError(await connect(), 503, 'UNAVAILABLE', { reason: 'BOT_NOT_CONFIGURED' });
    expect(telegram.calls).toEqual([]);
  });

  it('answers 429 with Retry-After and stops at the failed step', async () => {
    use({
      failures: {
        setWebhook: () => {
          throw apiError(429, 'Too Many Requests: retry after 3', { retry_after: 3 });
        }
      }
    });
    const response = await connect();
    await expectError(response, 429, 'RATE_LIMIT');
    expect(response.headers.get('retry-after')).toBe('3');
    expect(telegram.calls).toEqual([`setWebhook ${EXPECTED_URL}`]);
  });

  it('answers 503 on a network error mid-way and does not continue', async () => {
    use({
      failures: {
        deleteMyCommands: () => {
          throw networkError();
        }
      }
    });
    await expectError(await connect(), 503, 'UNAVAILABLE');
    expect(telegram.calls).toEqual([`setWebhook ${EXPECTED_URL}`, 'deleteMyCommands default -']);
  });

  it('answers 401 without a session and 400 for an unknown field', async () => {
    use();
    await expectError(await connect(null), 401, 'UNAUTHORIZED');
    await expectError(await connect(OWNER_TOKEN, { url: 'https://evil.example.com' }), 400, 'VALIDATION_ERROR');
    expect(telegram.calls).toEqual([]);
  });

  it('answers 400 without calling Telegram when the body is missing, not JSON or not an object', async () => {
    use();
    const post = (init: RequestInit & { json?: unknown }) =>
      api.request(`${ORIGIN}/api/v1/bot/connect`, { method: 'POST', ...init });
    await expectError(await post({}), 400, 'VALIDATION_ERROR');
    await expectError(
      await post({
        body: new URLSearchParams({ a: 'b' }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' }
      }),
      400,
      'VALIDATION_ERROR'
    );
    await expectError(await post({ body: '{}', headers: { 'content-type': 'text/plain' } }), 400, 'VALIDATION_ERROR');
    await expectError(await post({ json: [] }), 400, 'VALIDATION_ERROR');
    expect(telegram.calls).toEqual([]);
  });

  it('still accepts a JSON content type with a charset', async () => {
    use({ webhookInfo: NO_HOOK });
    const response = await api.request(`${ORIGIN}/api/v1/bot/connect`, {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
    expect(response.status).toBe(200);
  });

  it('answers 413 for an oversized body', async () => {
    use();
    const response = await api.request(`${ORIGIN}/api/v1/bot/connect`, {
      method: 'POST',
      json: { pad: 'x'.repeat(2048) }
    });
    await expectError(response, 413, 'VALIDATION_ERROR');
  });

  it('uses https for a public host even when the request arrived as http', async () => {
    use({ webhookInfo: NO_HOOK });
    await api.request('http://studio.example.com/api/v1/bot/connect', {
      method: 'POST',
      json: {},
      token: OWNER_TOKEN
    });
    expect(telegram.calls[0]).toBe(`setWebhook ${EXPECTED_URL}`);
  });

  it('never exposes the token or the webhook secret in a response or a log line', async () => {
    use({
      failures: {
        deleteMyCommands: () => {
          throw apiError(400, `Bad Request: https://api.telegram.org/bot${TEST_BOT_TOKEN}/x ${WEBHOOK_SECRET}`);
        }
      }
    });
    const failed = await (await connect()).text();

    use({ webhookInfo: { url: EXPECTED_URL, pending_update_count: 0 } });
    const ok = await (await connect()).text();
    const statusBody = await (await status()).text();

    for (const text of [failed, ok, statusBody, ...logLines]) {
      expect(text).not.toContain(WEBHOOK_SECRET);
      expect(text).not.toContain(TEST_BOT_TOKEN);
    }
    expect(logLines.some((line) => line.includes('telegram_http_400'))).toBe(true);
  });

  it('redacts the token from a webhook URL registered by an older setup', async () => {
    const encoded = encodeURIComponent(TEST_BOT_TOKEN);
    const urls = [
      `https://old.example.com/bot${TEST_BOT_TOKEN}/hook`,
      `https://old.example.com/bot${encoded}/hook`,
      'https://old.example.com/bot987654:OtherTokenFromAnOlderBot-0123456789abcdef/hook'
    ];
    for (const url of urls) {
      use({
        webhookInfo: {
          url,
          pending_update_count: 0,
          last_error_message: `Wrong response from https://old.example.com/bot${TEST_BOT_TOKEN}/hook`
        }
      });
      const text = await (await status()).text();
      expect(text).not.toContain(TEST_BOT_TOKEN);
      expect(text).not.toContain(encoded);
      expect(text).not.toContain('OtherTokenFromAnOlder');
      const body = botStatusSchema.parse(JSON.parse(text));
      expect(body.webhook).toMatchObject({ pointsHere: false });
      expect(body.webhook?.url).toBe('https://old.example.com/bot***/hook');
    }
  });

  it('computes pointsHere before redacting', async () => {
    use({ webhookInfo: { url: EXPECTED_URL, pending_update_count: 0 } });
    expect((await parsed(await status())).webhook).toMatchObject({ url: EXPECTED_URL, pointsHere: true });
  });
});

describe('POST /webhooks/telegram /start', () => {
  it('replies with the studio button of the request origin and refreshes the owner chat', async () => {
    use();
    const sent: { url: string; body: string }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      sent.push({ url: String(input instanceof Request ? input.url : input), body: String(init?.body ?? '') });
      return Promise.resolve(Response.json({ ok: true, result: { message_id: 1 } }));
    });
    const response = await api.request(`${ORIGIN}/webhooks/telegram`, {
      method: 'POST',
      token: null,
      json: startUpdate(),
      headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET }
    });

    expect(response.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toContain('/sendMessage');
    expect(sent[0]?.body).toContain(`${ORIGIN}/`);
    await Promise.all(api.background);
    expect(telegram.calls).toEqual([
      `setChatCommands ${OWNER_ID} start`,
      `setChatMenuWebApp ${OWNER_ID} Студия ${ORIGIN}/`
    ]);
  });

  it('answers 200 with exactly one reply while the owner chat setup is slow and then hangs', async () => {
    const hanging = new Promise<never>(() => {});
    let finishCommands: () => void = () => {};
    telegram = {
      ...fakeBotAdminApi(),
      setChatCommands: () =>
        new Promise((resolve) => {
          finishCommands = () => resolve(true);
        }),
      setChatMenuWebApp: () => hanging
    };
    api = createApi({ botInfo: BOT_INFO, webhookSecret: WEBHOOK_SECRET, botAdminApi: telegram });
    const sent: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      sent.push(String(input instanceof Request ? input.url : input));
      return Promise.resolve(Response.json({ ok: true, result: { message_id: 1 } }));
    });

    const response = await api.request(`${ORIGIN}/webhooks/telegram`, {
      method: 'POST',
      token: null,
      json: startUpdate(),
      headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET }
    });
    finishCommands();

    expect(response.status).toBe(200);
    expect(sent.filter((url) => url.endsWith('/sendMessage'))).toHaveLength(1);
    expect(api.background).toHaveLength(1);
  });

  it('logs a stable code when the owner chat setup fails after the reply, and still answers 200', async () => {
    use({
      failures: {
        setChatCommands: () => {
          throw apiError(400, `Bad Request: bot${TEST_BOT_TOKEN}`);
        }
      }
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(Response.json({ ok: true, result: { message_id: 1 } }))
    );
    const response = await api.request(`${ORIGIN}/webhooks/telegram`, {
      method: 'POST',
      token: null,
      json: startUpdate(),
      headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET }
    });
    await Promise.all(api.background);

    expect(response.status).toBe(200);
    expect(
      logLines.some((line) => line.includes('owner_chat.set_commands') && line.includes('telegram_http_400'))
    ).toBe(true);
    expect(logLines.join('\n')).not.toContain(TEST_BOT_TOKEN);
  });

  it('answers 200 and bounds the reply when Telegram does not answer it', async () => {
    use();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          })
      );
      const pending = api.request(`${ORIGIN}/webhooks/telegram`, {
        method: 'POST',
        token: null,
        json: startUpdate(),
        headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET }
      });
      await vi.advanceTimersByTimeAsync(4_500);
      expect((await pending).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
    expect(telegram.calls).toEqual([]);
    expect(api.background).toEqual([]);
    expect(logLines.some((line) => line.includes('handle_update') && line.includes('"errorCode"'))).toBe(true);
    expect(logLines.join('\n')).not.toContain(TEST_BOT_TOKEN);
  });

  it('answers 503 and does nothing when the secret is malformed, even if the header matches it', async () => {
    use({}, { webhookSecret: 'not valid!' });
    const fetched = vi.spyOn(globalThis, 'fetch');
    const response = await api.request(`${ORIGIN}/webhooks/telegram`, {
      method: 'POST',
      token: null,
      json: { update_id: 1 },
      headers: { 'x-telegram-bot-api-secret-token': 'not valid!' }
    });
    await expectError(response, 503, 'UNAVAILABLE');
    expect(fetched).not.toHaveBeenCalled();
    expect(telegram.calls).toEqual([]);
  });
});
