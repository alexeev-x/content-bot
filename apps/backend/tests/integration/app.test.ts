import { apiErrorSchema, healthSchema } from '@alexeev/contracts';
import { exports } from 'cloudflare:workers';
import { HTTPException } from 'hono/http-exception';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/create-app';
import type { AppEnv } from '../../src/app/env';

const BASE = 'https://content-bot.test';

describe('Worker fetch', () => {
  it('GET /api/v1/health returns a body valid for healthSchema', async () => {
    const response = await exports.default.fetch(`${BASE}/api/v1/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBeTruthy();
    const body = healthSchema.parse(await response.json());
    expect(body).toMatchObject({ status: 'ok', service: 'content-bot', publishingEnabled: false });
  });

  it('answers unknown /api/v1/* with a JSON NOT_FOUND carrying the requestId', async () => {
    const response = await exports.default.fetch(`${BASE}/api/v1/nope`);

    expect(response.status).toBe(404);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBe(response.headers.get('x-request-id'));
  });

  it('POST /webhooks/telegram answers an anonymous caller with 401 while nothing is configured', async () => {
    const response = await exports.default.fetch(`${BASE}/webhooks/telegram`, { method: 'POST', body: '{}' });

    expect(response.status).toBe(401);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });
});

describe('HTTPException mapping', () => {
  it.each([
    [405, 'VALIDATION_ERROR'],
    [409, 'CONFLICT'],
    [429, 'RATE_LIMIT'],
    [502, 'UNAVAILABLE'],
  ] as const)('status %i keeps its status and carries code %s', async (status, code) => {
    const app = createApp();
    app.get('/api/v1/http-error', () => {
      throw new HTTPException(status);
    });

    const response = await app.request('/api/v1/http-error');

    expect(response.status).toBe(status);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe(code);
  });
});

describe('Telegram webhook with a configured bot', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const env = {
    OWNER_TELEGRAM_ID: '4242',
    TELEGRAM_BOT_TOKEN: '123456:TEST',
    TELEGRAM_WEBHOOK_SECRET: 'hook-secret',
    BOT_INFO: JSON.stringify({ id: 1, is_bot: true, first_name: 'Bot', username: 'content_bot' }),
  } as AppEnv;

  const post = (headers: Record<string, string>, body: unknown = { update_id: 1 }) =>
    createApp().request(
      '/webhooks/telegram',
      { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) },
      env,
    );

  it('answers 503 only after the secret is proven, when the rest of the bot config is missing', async () => {
    const response = await createApp().request(
      '/webhooks/telegram',
      { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'hook-secret' }, body: '{}' },
      { ...env, TELEGRAM_BOT_TOKEN: undefined } as AppEnv,
    );

    expect(response.status).toBe(503);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('UNAVAILABLE');
  });

  it('rejects a missing or wrong secret with 401 JSON', async () => {
    const cases: Record<string, string>[] = [{}, { 'x-telegram-bot-api-secret-token': 'wrong' }];
    for (const headers of cases) {
      const response = await post(headers);
      expect(response.status).toBe(401);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
    }
  });

  it('accepts a correct secret and silently ignores an update from a non-owner', async () => {
    const update = {
      update_id: 2,
      message: {
        message_id: 1,
        date: 1,
        chat: { id: 777, type: 'private', first_name: 'Eve' },
        from: { id: 777, is_bot: false, first_name: 'Eve' },
        text: '/start',
        entities: [{ type: 'bot_command', offset: 0, length: 6 }],
      },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const logSpy = vi.spyOn(console, 'log');

    const response = await post({ 'x-telegram-bot-api-secret-token': 'hook-secret' }, update);

    expect(response.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    const errorLines = logSpy.mock.calls.filter(([line]) => String(line).includes('"level":"error"'));
    expect(errorLines).toEqual([]);
  });

  it('rejects an oversized body with 413 JSON', async () => {
    const response = await post({ 'x-telegram-bot-api-secret-token': 'hook-secret' }, { pad: 'x'.repeat(300_000) });

    expect(response.status).toBe(413);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('VALIDATION_ERROR');
  });
});
