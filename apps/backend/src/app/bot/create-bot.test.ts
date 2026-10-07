import type { Update, UserFromGetMe } from 'grammy/types';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../env';
import { apiError } from '../../../tests/helpers/fake-chat-api';
import { fakeBotAdminApi, type Failures } from '../../../tests/helpers/fake-bot-admin-api';
import type { LogEvent } from '../../platform/logging/logger';
import type { BotIdentityStore } from './bot-identity-store';
import { type BotConfig, createBot, inspectBotSetup, loadBotSetup } from './create-bot';
import { createTelegramCaller } from './telegram-call';

const BOT_INFO = { id: 1, is_bot: true, first_name: 'Bot', username: 'content_bot' };

const baseEnv = {
  OWNER_TELEGRAM_ID: '4242',
  TELEGRAM_BOT_TOKEN: '123456:TEST',
  TELEGRAM_WEBHOOK_SECRET: 'hook-secret',
  BOT_INFO: JSON.stringify(BOT_INFO)
} as AppEnv;

const readBotConfig = (env: AppEnv, stored: UserFromGetMe | null = null) => inspectBotSetup(env, stored).config;

describe('readBotConfig', () => {
  it('builds a config from complete settings', () => {
    const config = readBotConfig(baseEnv);
    expect(config).toMatchObject({ token: '123456:TEST', webhookSecret: 'hook-secret', ownerId: 4242 });
    expect(config?.botInfo.username).toBe('content_bot');
  });

  it('accepts a 16-digit owner id', () => {
    const config = readBotConfig({ ...baseEnv, OWNER_TELEGRAM_ID: '1234567890123456' } as AppEnv);
    expect(config?.ownerId).toBe(1_234_567_890_123_456);
  });

  it.each([
    ['no token', { TELEGRAM_BOT_TOKEN: undefined }],
    ['no secret', { TELEGRAM_WEBHOOK_SECRET: undefined }],
    ['no BOT_INFO', { BOT_INFO: undefined }],
    ['BOT_INFO not JSON', { BOT_INFO: '{oops' }],
    ['BOT_INFO without username', { BOT_INFO: JSON.stringify({ id: 1, is_bot: true, first_name: 'Bot' }) }],
    ['secret with a character Telegram rejects', { TELEGRAM_WEBHOOK_SECRET: 'hook secret!' }],
    ['secret longer than 256 characters', { TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(257) }],
    ['empty owner id', { OWNER_TELEGRAM_ID: '' }],
    ['non-numeric owner id', { OWNER_TELEGRAM_ID: 'alex' }],
    ['owner id beyond the safe integer range', { OWNER_TELEGRAM_ID: '9007199254740993' }]
  ])('returns null for %s', (_name, patch) => {
    expect(readBotConfig({ ...baseEnv, ...patch } as AppEnv)).toBeNull();
  });
});

function startUpdate(fromId: number): Update {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      date: 1,
      chat: { id: fromId, type: 'private', first_name: 'X' },
      from: { id: fromId, is_bot: false, first_name: 'X' },
      text: '/start',
      entities: [{ type: 'bot_command', offset: 0, length: 6 }]
    }
  };
}

async function run(fromId: number, failures: Failures = {}, adminApi = fakeBotAdminApi({ failures })) {
  const config = readBotConfig(baseEnv) as BotConfig;
  const background: Promise<unknown>[] = [];
  const events: LogEvent[] = [];
  const logger = { info: () => {}, warn: (e: LogEvent) => events.push(e), error: (e: LogEvent) => events.push(e) };
  const bot = createBot(config, {
    appOrigin: 'https://studio.example.com',
    adminApi,
    call: createTelegramCaller({ logger }),
    waitUntil: (work) => background.push(work),
    onError: (error) =>
      events.push({
        component: 'bot',
        operation: 'handle_update',
        errorCode: error instanceof Error ? error.name : 'unknown'
      })
  });
  const calls: { method: string; payload: unknown }[] = [];
  bot.api.config.use((_prev, method, payload) => {
    calls.push({ method, payload });
    return Promise.resolve({ ok: true, result: true } as never);
  });
  await bot.handleUpdate(startUpdate(fromId));
  // What the Worker keeps running after the webhook has answered.
  const settleBackground = () => Promise.all(background);
  return { calls, adminCalls: adminApi.calls, events, background, settleBackground };
}

const STORED = { id: 123456, is_bot: true, first_name: 'Stored', username: 'stored_bot' } as UserFromGetMe;

function countingStore(row: UserFromGetMe | null): BotIdentityStore & { loads: number } {
  const store = {
    loads: 0,
    load() {
      store.loads += 1;
      return Promise.resolve(row);
    },
    save: () => Promise.resolve()
  };
  return store;
}

function recordingLog() {
  const events: LogEvent[] = [];
  const logger = { info: () => {}, warn: (e: LogEvent) => events.push(e), error: (e: LogEvent) => events.push(e) };
  return { events, log: { logger, requestId: 'req-1' } };
}

describe('loadBotSetup', () => {
  it('reads the store only when BOT_INFO is absent', async () => {
    const store = countingStore(STORED);
    const { log, events } = recordingLog();
    expect((await loadBotSetup(baseEnv, store, log)).botUsername).toBe('content_bot');
    expect((await loadBotSetup({ ...baseEnv, BOT_INFO: '{oops' } as AppEnv, store, log)).missing).toEqual(['BOT_INFO']);
    expect(store.loads).toBe(0);
    expect((await loadBotSetup({ ...baseEnv, BOT_INFO: undefined } as AppEnv, store, log)).botUsername).toBe(
      'stored_bot'
    );
    expect(store.loads).toBe(1);
    expect(events).toEqual([]);
  });

  it('logs only a stable code when the stored identity belongs to another bot than the token', async () => {
    const { log, events } = recordingLog();
    const setup = await loadBotSetup(
      { ...baseEnv, BOT_INFO: undefined } as AppEnv,
      countingStore({ ...STORED, id: 999 }),
      log
    );
    expect(setup.config).toBeNull();
    expect(events).toEqual([
      { component: 'bot', operation: 'bot_identity.load', requestId: 'req-1', errorCode: 'BOT_IDENTITY_MISMATCH' }
    ]);
  });
});

describe('inspectBotSetup', () => {
  it('lists every missing setting by name', () => {
    const setup = inspectBotSetup({ OWNER_TELEGRAM_ID: 'x' } as AppEnv, null);
    expect(setup.config).toBeNull();
    expect(setup.missing).toEqual(['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'OWNER_TELEGRAM_ID']);
  });

  it('does not list an absent BOT_INFO, but still has no config without any identity', () => {
    const setup = inspectBotSetup({ ...baseEnv, BOT_INFO: undefined } as AppEnv, null);
    expect(setup.missing).toEqual([]);
    expect(setup.settings).toMatchObject({ token: '123456:TEST', ownerId: 4242 });
    expect(setup.config).toBeNull();
    expect(setup.botUsername).toBeNull();
  });

  it('reports a malformed BOT_INFO and blocks the config', () => {
    const setup = inspectBotSetup({ ...baseEnv, BOT_INFO: '{oops' } as AppEnv, STORED);
    expect(setup.missing).toEqual(['BOT_INFO']);
    expect(setup.settings).toBeNull();
    expect(setup.config).toBeNull();
  });

  it('takes the identity from the stored row when BOT_INFO is absent', () => {
    const setup = inspectBotSetup({ ...baseEnv, BOT_INFO: undefined } as AppEnv, STORED);
    expect(setup.missing).toEqual([]);
    expect(setup.config?.botInfo.username).toBe('stored_bot');
    expect(setup.botUsername).toBe('stored_bot');
  });

  it('prefers a valid BOT_INFO over the stored row', () => {
    expect(inspectBotSetup(baseEnv, STORED).config?.botInfo.username).toBe('content_bot');
  });

  it('ignores a stored identity of another bot than the token belongs to', () => {
    const other = { ...STORED, id: 999 };
    const setup = inspectBotSetup({ ...baseEnv, BOT_INFO: undefined } as AppEnv, other);
    expect(setup.config).toBeNull();
    expect(setup.botUsername).toBeNull();
  });

  it('does not use a stored identity when the token carries no bot id', () => {
    const env = { ...baseEnv, BOT_INFO: undefined, TELEGRAM_BOT_TOKEN: 'not-a-token' } as AppEnv;
    const setup = inspectBotSetup(env, STORED);
    expect(setup.config).toBeNull();
    expect(setup.botUsername).toBeNull();
    expect(inspectBotSetup({ ...env, TELEGRAM_BOT_TOKEN: undefined } as AppEnv, STORED).botUsername).toBeNull();
  });

  it('treats a whitespace-only token as missing and trims a padded one', () => {
    expect(inspectBotSetup({ ...baseEnv, TELEGRAM_BOT_TOKEN: ' \n' } as AppEnv, null).missing).toEqual([
      'TELEGRAM_BOT_TOKEN'
    ]);
    expect(readBotConfig({ ...baseEnv, TELEGRAM_BOT_TOKEN: '123456:TEST\n' } as AppEnv)?.token).toBe('123456:TEST');
  });
});

describe('bot', () => {
  it('answers /start from the owner with the studio button and refreshes the owner chat', async () => {
    const { calls, adminCalls, settleBackground } = await run(4242);
    await settleBackground();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'sendMessage',
      payload: {
        chat_id: 4242,
        text: 'Студия на связи. Откройте её кнопкой ниже.',
        reply_markup: {
          inline_keyboard: [[{ text: 'Открыть студию', web_app: { url: 'https://studio.example.com/' } }]]
        }
      }
    });
    expect(adminCalls).toEqual([
      'setChatCommands 4242 start',
      'setChatMenuWebApp 4242 Студия https://studio.example.com/'
    ]);
  });

  it('still replies when setting the commands fails, and logs a stable code', async () => {
    const { calls, adminCalls, events, settleBackground } = await run(4242, {
      setChatCommands: () => {
        throw apiError(400, 'Bad Request: secret-text');
      }
    });
    await expect(settleBackground()).resolves.toBeDefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('sendMessage');
    expect(adminCalls).toEqual(['setChatCommands 4242 start']);
    expect(events).toEqual([
      { component: 'telegram', operation: 'owner_chat.set_commands', status: 503, errorCode: 'telegram_http_400' }
    ]);
  });

  it('answers /start without waiting for the owner chat setup, which never finishes here', async () => {
    const hanging = new Promise<never>(() => {});
    const adminApi = {
      ...fakeBotAdminApi(),
      setChatCommands: () => hanging,
      setChatMenuWebApp: () => hanging
    };
    const { calls, background } = await run(4242, {}, adminApi);
    expect(calls.map((call) => call.method)).toEqual(['sendMessage']);
    expect(background).toHaveLength(1);
  });

  it('ignores everyone else silently', async () => {
    const { calls, adminCalls, background } = await run(777);
    expect(calls).toEqual([]);
    expect(adminCalls).toEqual([]);
    expect(background).toEqual([]);
  });
});
