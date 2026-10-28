import type { WriterDeps } from '../../modules/ai';
import type { CreatePostInput } from '@alexeev/contracts';
import type { Update, UserFromGetMe } from 'grammy/types';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../env';
import { apiError } from '../../../tests/helpers/fake-chat-api';
import { type FakeBotAdminApi, fakeBotAdminApi, type Failures } from '../../../tests/helpers/fake-bot-admin-api';
import type { LogEvent } from '../../platform/logging/logger';
import type { BotIdentityStore } from './bot-identity-store';
import { type BotConfig, type BotRuntime, createBot, inspectBotSetup, loadBotSetup } from './create-bot';
import type { OwnerReply } from './owner-reports';
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

interface Harness {
  drafts: { input: CreatePostInput; key: string }[];
  seen: Set<number>;
  origins: string[];
  runtime: Partial<BotRuntime>;
}

const answer = (text: string): OwnerReply => ({
  html: text,
  button: { text: `button of ${text}`, url: `https://studio.example.com/${text}` }
});

function harness(overrides: Partial<BotRuntime> = {}): Harness {
  const drafts: Harness['drafts'] = [];
  const seen = new Set<number>();
  const origins: string[] = [];
  return {
    drafts,
    seen,
    origins,
    runtime: {
      clock: { now: () => 1_000 },
      updates: {
        claim: (updateId) => {
          const first = !seen.has(updateId);
          seen.add(updateId);
          return Promise.resolve(first);
        }
      },
      reports: {
        status: () => Promise.resolve(answer('status'))
      },
      publish: {
        buttons: () => Promise.resolve([]),
        perform: () => Promise.resolve({ kind: 'busy' }),
        buttonsFor: () => Promise.resolve(null),
        awaitTime: () => Promise.resolve(false),
        awaitingTime: () => Promise.resolve(null),
        stopAwaitingTime: () => Promise.resolve(),
        timezone: () => Promise.resolve('UTC')
      },
      contamination: () => Promise.resolve(),
      createDraft: (input, key) => {
        drafts.push({ input, key });
        return Promise.resolve({ id: `post-${drafts.length}`, revision: 0 });
      },
      rememberAppOrigin: (origin) => {
        origins.push(origin);
        return Promise.resolve();
      },
      writer: () =>
        Promise.resolve({
          writer: {
            // /post mode is open: plain texts and files become drafts.
            touchRequest: () => Promise.resolve({ kind: 'post', history: [], format: null }),
            findByChatMessage: () => Promise.resolve(null)
          }
        } as unknown as WriterDeps),
      ...overrides
    }
  };
}

async function runUpdates(
  updates: Update[],
  options: { failures?: Failures; adminApi?: FakeBotAdminApi; chatType?: string; setup?: Harness } = {}
) {
  const adminApi = options.adminApi ?? fakeBotAdminApi({ failures: options.failures ?? {} });
  const setup = options.setup ?? harness();
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
      }),
    ...(setup.runtime as Omit<BotRuntime, 'appOrigin' | 'adminApi' | 'call' | 'waitUntil' | 'onError'>)
  });
  const calls: { method: string; payload: Record<string, unknown> }[] = [];
  bot.api.config.use((_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    return Promise.resolve({ ok: true, result: true } as never);
  });
  for (const update of updates) await bot.handleUpdate(update);
  // What the Worker keeps running after the webhook has answered.
  const settleBackground = () => Promise.all(background);
  return { calls, adminCalls: adminApi.calls, events, background, settleBackground, setup };
}

async function run(fromId: number, failures: Failures = {}, adminApi = fakeBotAdminApi({ failures })) {
  return runUpdates([startUpdate(fromId)], { adminApi });
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
    expect(adminCalls).toEqual(['setChatCommands 4242 start,redactor,post,analytics,stop', 'setChatMenuCommands 4242']);
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
    expect(adminCalls).toEqual(['setChatCommands 4242 start,redactor,post,analytics,stop']);
    expect(events).toEqual([
      {
        component: 'telegram',
        operation: 'owner_chat.set_commands',
        status: 503,
        errorCode: 'telegram_http_400',
        detail: expect.stringContaining('Bad Request')
      }
    ]);
    expect(JSON.stringify(events)).not.toContain('123456:TEST');
  });

  it('answers /start without waiting for the owner chat setup, which never finishes here', async () => {
    const hanging = new Promise<never>(() => {});
    const adminApi = {
      ...fakeBotAdminApi(),
      setChatCommands: () => hanging,
      setChatMenuCommands: () => hanging
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

function textUpdate(
  fromId: number,
  text: string,
  extra: { updateId?: number; chatType?: 'private' | 'group'; forwarded?: boolean; command?: boolean } = {}
): Update {
  const chatType = extra.chatType ?? 'private';
  return {
    update_id: extra.updateId ?? 100,
    message: {
      message_id: 10,
      date: 1,
      chat:
        chatType === 'private'
          ? { id: fromId, type: 'private', first_name: 'X' }
          : { id: -5, type: 'group', title: 'G' },
      from: { id: fromId, is_bot: false, first_name: 'X' },
      text,
      ...(extra.command === true
        ? { entities: [{ type: 'bot_command' as const, offset: 0, length: text.length }] }
        : {}),
      ...(extra.forwarded === true
        ? {
            forward_origin: {
              type: 'channel' as const,
              date: 1,
              chat: { id: -100, type: 'channel' as const, title: 'C' },
              message_id: 3
            }
          }
        : {})
    }
  } as Update;
}

const sentMessages = (calls: { method: string }[]) => calls.filter((call) => call.method === 'sendMessage');

describe('owner commands', () => {
  it('/status answers with its report as HTML and one Mini App button', async () => {
    const { calls } = await runUpdates([textUpdate(4242, '/status', { command: true })]);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'sendMessage',
      payload: {
        chat_id: 4242,
        text: 'status',
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: {
          inline_keyboard: [[{ text: 'button of status', web_app: { url: 'https://studio.example.com/status' } }]]
        }
      }
    });
  });

  it('answers a failed read with a plain message, logs a stable code and no payload', async () => {
    const setup = harness({
      reports: {
        status: () => Promise.reject(new Error('D1 down: secret-detail'))
      }
    });
    const { calls, events } = await runUpdates([textUpdate(4242, '/status', { command: true })], { setup });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'sendMessage',
      payload: { text: 'Не удалось получить данные. Попробуйте ещё раз.' }
    });
    expect(events).toEqual([{ component: 'bot', operation: 'handle_update', errorCode: 'Error' }]);
    expect(JSON.stringify(events)).not.toContain('secret-detail');
  });

  it('remembers the origin on /start for the alerts of Cron', async () => {
    const setup = harness();
    const { settleBackground } = await runUpdates([startUpdate(4242)], { setup });
    await settleBackground();
    expect(setup.origins).toEqual(['https://studio.example.com']);
  });

  it('still configures the owner chat when the origin cannot be stored', async () => {
    const setup = harness({ rememberAppOrigin: () => Promise.reject(new Error('no such table')) });
    const { settleBackground, adminCalls, events } = await runUpdates([startUpdate(4242)], { setup });
    await settleBackground();
    expect(adminCalls).toHaveLength(2);
    expect(events).toEqual([{ component: 'bot', operation: 'handle_update', errorCode: 'Error' }]);
  });
});

describe('drafts from messages', () => {
  it('outside /post and /redactor a text or a forward is not a post: the bot names the two commands', async () => {
    const setup = harness({
      writer: () =>
        Promise.resolve({
          writer: { touchRequest: () => Promise.resolve(null), findByChatMessage: () => Promise.resolve(null) }
        } as unknown as WriterDeps)
    });
    const { calls } = await runUpdates(
      [textUpdate(4242, 'Привет'), textUpdate(4242, 'Новость', { updateId: 2, forwarded: true })],
      {
        setup
      }
    );

    expect(setup.drafts).toEqual([]);
    expect(calls.filter((call) => call.method === 'sendMessage').map((call) => call.payload.text)).toEqual([
      'Чтобы сделать пост — /post, чтобы написать с ИИ — /redactor.',
      'Чтобы сделать пост — /post, чтобы написать с ИИ — /redactor.'
    ]);
  });

  it('turns a forwarded text into a draft, keeps emoji whole and replies with an Open button', async () => {
    const text = 'Релиз 7.40 🚀\n\nНовые герои 👩‍💻 и баланс\n- первое\n- второе';
    const setup = harness();
    const { calls } = await runUpdates([textUpdate(4242, text, { forwarded: true })], { setup });

    expect(setup.drafts).toEqual([
      {
        // No title (owner, 16.10.2026): the whole text is the body; the server names the post after its start.
        input: { body: 'Релиз 7.40 🚀\n\nНовые герои 👩‍💻 и баланс\n- первое\n- второе', entities: [], kind: 'text' },
        key: 'tg-update-100'
      }
    ]);
    expect(sentMessages(calls)).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'sendMessage',
      payload: {
        chat_id: 4242,
        text: 'Черновик создан',
        reply_markup: {
          inline_keyboard: [[{ text: 'Открыть в Студии', web_app: { url: 'https://studio.example.com/posts/post-1' } }]]
        }
      }
    });
    expect(calls[0]?.payload).not.toHaveProperty('parse_mode');
  });

  it('a single line is the body, trimmed, with no title', async () => {
    const setup = harness();
    await runUpdates([textUpdate(4242, '  Просто строка  ')], { setup });
    expect(setup.drafts[0]?.input).toEqual({ body: 'Просто строка', entities: [], kind: 'text' });
  });

  it('keeps a long first line whole in the body: nothing is cut into a title', async () => {
    const line = `${'а'.repeat(198)}🚀${'б'.repeat(50)}`;
    const setup = harness();
    await runUpdates([textUpdate(4242, `${line}\nвторая строка`)], { setup });
    expect(setup.drafts[0]?.input).toEqual({ body: `${line}\nвторая строка`, entities: [], kind: 'text' });
  });

  it('refuses a body over the contract limit without creating a draft, counting UTF-16 units', async () => {
    // 2049 emoji are 4098 UTF-16 units: more than 4096 although fewer than 4096 code points.
    const text = `Заголовок\n${'😀'.repeat(2049)}`;
    const setup = harness();
    const { calls } = await runUpdates([textUpdate(4242, text)], { setup });

    expect(setup.drafts).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ payload: { text: 'Текст длиннее 4096 символов, черновик не создан.' } });
  });

  it('accepts a body of exactly 4096 units', async () => {
    const setup = harness();
    await runUpdates([textUpdate(4242, '😀'.repeat(2048))], { setup });
    expect(setup.drafts).toHaveLength(1);
  });

  it('refuses text with a control character', async () => {
    const setup = harness();
    const { calls } = await runUpdates([textUpdate(4242, 'Заголовок\nтекст\u0007')], { setup });
    expect(setup.drafts).toEqual([]);
    expect(calls[0]).toMatchObject({ payload: { text: 'Текст содержит недопустимые символы, черновик не создан.' } });
  });

  it('processes a repeated update_id once: one draft, one reply', async () => {
    const setup = harness();
    const same = textUpdate(4242, 'Один раз', { updateId: 555 });
    const { calls } = await runUpdates([same, same], { setup });

    expect(setup.drafts).toHaveLength(1);
    expect(sentMessages(calls)).toHaveLength(1);
  });

  it('does not make a post of an unknown command', async () => {
    const setup = harness();
    const { calls } = await runUpdates([textUpdate(4242, '/unknown', { command: true })], { setup });
    expect(setup.drafts).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('answers a failed save and logs a stable code', async () => {
    const setup = harness({ createDraft: () => Promise.reject(new Error('D1 down')) });
    const { calls, events } = await runUpdates([textUpdate(4242, 'Текст')], { setup });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ payload: { text: 'Не удалось создать черновик. Отправьте текст ещё раз.' } });
    expect(events).toEqual([{ component: 'bot', operation: 'handle_update', errorCode: 'Error' }]);
  });
});

describe('who the bot answers', () => {
  it.each([
    ['a command', '/status', true],
    ['a text', 'Привет', false]
  ])('ignores %s from anyone but the owner: no reply, no draft, no stored update id', async (_name, text, command) => {
    const setup = harness();
    const { calls, adminCalls, background } = await runUpdates([textUpdate(777, text, { command })], { setup });

    expect(calls).toEqual([]);
    expect(adminCalls).toEqual([]);
    expect(background).toEqual([]);
    expect(setup.drafts).toEqual([]);
    expect(setup.seen.size).toBe(0);
  });

  it('ignores the owner in a group chat', async () => {
    const setup = harness();
    const { calls } = await runUpdates([textUpdate(4242, 'Привет', { chatType: 'group' })], { setup });
    expect(calls).toEqual([]);
    expect(setup.drafts).toEqual([]);
  });
});
