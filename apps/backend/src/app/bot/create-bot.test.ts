import type { Update } from 'grammy/types';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../env';
import { apiError } from '../../../tests/helpers/fake-chat-api';
import { fakeBotAdminApi, type Failures } from '../../../tests/helpers/fake-bot-admin-api';
import type { LogEvent } from '../../platform/logging/logger';
import { type BotConfig, createBot, inspectBotSetup, readBotConfig } from './create-bot';
import { createTelegramCaller } from './telegram-call';

const BOT_INFO = { id: 1, is_bot: true, first_name: 'Bot', username: 'content_bot' };

const baseEnv = {
  OWNER_TELEGRAM_ID: '4242',
  TELEGRAM_BOT_TOKEN: '123456:TEST',
  TELEGRAM_WEBHOOK_SECRET: 'hook-secret',
  BOT_INFO: JSON.stringify(BOT_INFO)
} as AppEnv;

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

async function run(fromId: number, failures: Failures = {}) {
  const config = readBotConfig(baseEnv) as BotConfig;
  const adminApi = fakeBotAdminApi({ failures });
  const events: LogEvent[] = [];
  const logger = { info: () => {}, warn: (e: LogEvent) => events.push(e), error: (e: LogEvent) => events.push(e) };
  const bot = createBot(config, {
    appOrigin: 'https://studio.example.com',
    adminApi,
    call: createTelegramCaller({ logger })
  });
  const calls: { method: string; payload: unknown }[] = [];
  bot.api.config.use((_prev, method, payload) => {
    calls.push({ method, payload });
    return Promise.resolve({ ok: true, result: true } as never);
  });
  await bot.handleUpdate(startUpdate(fromId));
  return { calls, adminCalls: adminApi.calls, events };
}

describe('inspectBotSetup', () => {
  it('lists every missing setting by name', () => {
    const setup = inspectBotSetup({ OWNER_TELEGRAM_ID: 'x' } as AppEnv);
    expect(setup.config).toBeNull();
    expect(setup.missing).toEqual(['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'BOT_INFO', 'OWNER_TELEGRAM_ID']);
  });

  it('treats a whitespace-only token as missing and trims a padded one', () => {
    expect(inspectBotSetup({ ...baseEnv, TELEGRAM_BOT_TOKEN: ' \n' } as AppEnv).missing).toEqual([
      'TELEGRAM_BOT_TOKEN'
    ]);
    expect(readBotConfig({ ...baseEnv, TELEGRAM_BOT_TOKEN: '123456:TEST\n' } as AppEnv)?.token).toBe('123456:TEST');
  });
});

describe('bot', () => {
  it('answers /start from the owner with the studio button and refreshes the owner chat', async () => {
    const { calls, adminCalls } = await run(4242);
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
    const { calls, adminCalls, events } = await run(4242, {
      setChatCommands: () => {
        throw apiError(400, 'Bad Request: secret-text');
      }
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('sendMessage');
    expect(adminCalls).toEqual(['setChatCommands 4242 start']);
    expect(events).toEqual([
      { component: 'telegram', operation: 'owner_chat.set_commands', status: 503, errorCode: 'telegram_http_400' }
    ]);
  });

  it('ignores everyone else silently', async () => {
    const { calls, adminCalls } = await run(777);
    expect(calls).toEqual([]);
    expect(adminCalls).toEqual([]);
  });
});
