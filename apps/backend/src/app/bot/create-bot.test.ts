import type { Update } from 'grammy/types';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../env';
import { type BotConfig, createBot, readBotConfig } from './create-bot';

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

async function run(fromId: number) {
  const config = readBotConfig(baseEnv) as BotConfig;
  const bot = createBot(config);
  const calls: { method: string; payload: unknown }[] = [];
  bot.api.config.use((_prev, method, payload) => {
    calls.push({ method, payload });
    return Promise.resolve({ ok: true, result: true } as never);
  });
  await bot.handleUpdate(startUpdate(fromId));
  return calls;
}

describe('bot', () => {
  it('answers /start from the owner', async () => {
    const calls = await run(4242);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'sendMessage', payload: { chat_id: 4242, text: 'Бот на связи' } });
  });

  it('ignores everyone else silently', async () => {
    expect(await run(777)).toEqual([]);
  });
});
