import type { UpdateAiSettingsInput } from '@alexeev/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AiTextProvider, createD1AiRepository, updateAiSettings } from '../../src/modules/ai';
import { RULES_IN_USE_MAX } from '../../src/modules/ai';
import { testDb } from '../helpers/db';
import { fakeBotAdminApi } from '../helpers/fake-bot-admin-api';
import { type Api, createApi, fakeClock, OWNER_ID, resetDb } from '../helpers/harness';
import { writerAnswer } from '../helpers/writer-answer';

// The owner's rules for the AI writer (AI plan P7; MEM-01, MEM-08, TG-15): asked for their scope once, used only
// in the prompts of that scope, and gone from the next prompts when switched off.

const SECRET = 'hook-secret-PLACEHOLDER';
const BOT_INFO = JSON.stringify({ id: 123456, is_bot: true, first_name: 'Bot', username: 'content_bot' });
const ORIGIN = 'https://studio.example.com';
const CHAT_ID = Number(OWNER_ID);
const RULE = 'не начинай с описания героя';

type TelegramCall = {
  method: string;
  body: { text?: string; reply_markup?: { inline_keyboard?: { callback_data?: string }[][] } };
};

let api: Api;
let calls: TelegramCall[];
let inputs: string[];
let updateId: number;

const settings: Omit<UpdateAiSettingsInput, 'revision'> = {
  provider: 'openai',
  enabled: true,
  draftModel: 'gpt-6.1-sol',
  cheapModel: 'gpt-6-luna',
  videoReviews: false,
  prices: [],
  monthlyBudgetUsd: 5,
  dailyCapUsd: 1,
  warnAtPercent: 80
};

beforeEach(async () => {
  await resetDb();
  await updateAiSettings({ repo: createD1AiRepository(testDb()), clock: fakeClock() }, { revision: 0, ...settings });
  calls = [];
  inputs = [];
  updateId = 7000;
  const provider: AiTextProvider = {
    provider: 'openai',
    complete: (request) => {
      inputs.push(request.input);
      return Promise.resolve({
        text: writerAnswer({
          hooks: ['Хук.'],
          text: 'Текст сценария про героя и его косяки.',
          topic: 't',
          device: 'd',
          ending: 'e'
        }),
        model: 'gpt-6.1-sol',
        usage: { inputTokens: 1000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 100 }
      });
    }
  };
  api = createApi({
    clock: fakeClock(),
    botInfo: BOT_INFO,
    webhookSecret: SECRET,
    botAdminApi: fakeBotAdminApi(),
    aiProvider: provider
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  let messageId = 50;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const method =
      String(input instanceof Request ? input.url : input)
        .split('/')
        .pop() ?? '';
    const body = JSON.parse(String(init?.body ?? '{}')) as TelegramCall['body'];
    calls.push({ method, body });
    const result =
      method === 'sendMessage'
        ? { message_id: ++messageId, date: 1, chat: { id: CHAT_ID, type: 'private', first_name: 'X' }, text: body.text }
        : true;
    return Promise.resolve(Response.json({ ok: true, result }));
  });
});

afterEach(() => vi.restoreAllMocks());

const from = { id: CHAT_ID, is_bot: false, first_name: 'X' };
const chat = { id: CHAT_ID, type: 'private', first_name: 'X' };
const deliver = (update: unknown) =>
  api.request(`${ORIGIN}/webhooks/telegram`, {
    method: 'POST',
    token: null,
    headers: { 'x-telegram-bot-api-secret-token': SECRET },
    json: update
  });
const say = (text: string, command = false) =>
  deliver({
    update_id: ++updateId,
    message: {
      message_id: updateId,
      date: 1,
      chat,
      from,
      text,
      ...(command ? { entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0]!.length }] } : {})
    }
  });
const tap = (data: string) =>
  deliver({
    update_id: ++updateId,
    callback_query: {
      id: `cb-${updateId}`,
      chat_instance: 'x',
      from,
      data,
      message: { message_id: 51, date: 1, chat, text: 'x' }
    }
  });
const buttons = () =>
  calls
    .filter((call) => call.method === 'sendMessage')
    .at(-1)
    ?.body.reply_markup?.inline_keyboard?.flat()
    .map((button) => button.callback_data ?? '') ?? [];

describe('owner rules', () => {
  it('asks for the scope once, uses the rule only there, and drops it from the next prompts when switched off', async () => {
    await say(`/rule ${RULE}`, true);
    const scopeButton = buttons().find((data) => data.endsWith(':i'));
    expect(scopeButton).toMatch(/^rl:[0-9a-f-]{36}:i$/);
    await tap(scopeButton!);
    // A second tap, another scope or «Отмена» afterwards changes nothing (review 19.10.2026).
    await tap(scopeButton!.replace(/:i$/, ':f'));
    await tap(scopeButton!.replace(/:i$/, ':x'));
    expect(
      await testDb().prepare('SELECT scope, status FROM ai_rules').all<{ scope: string; status: string }>()
    ).toMatchObject({ results: [{ scope: 'igrat', status: 'active' }] });

    await say('Учусь играть на Пудже: промахнулся хуком');
    await api.settle();
    await say('Учу фидить на Пудже');
    await api.settle();
    // A job that ran is marked finished, so the lost-job check never reports it (review 19.10.2026).
    expect(
      await testDb().prepare('SELECT count(*) AS n FROM ai_queue_jobs WHERE finished_at IS NULL').first<{ n: number }>()
    ).toEqual({ n: 0 });
    expect(inputs[0]).toContain(`ПРАВИЛА АВТОРА`);
    expect(inputs[0]).toContain(`- ${RULE}`);
    expect(inputs[1]).not.toContain(RULE);

    await say('/rules', true);
    expect(calls.filter((call) => call.method === 'sendMessage').at(-1)?.body.text).toContain(RULE);
    const off = buttons().find((data) => data.endsWith(':off'));
    await tap(off!);
    await say('Учусь играть на Инвокере: забыл комбинации');
    await api.settle();
    expect(inputs[2]).not.toContain(RULE);
  });

  it('refuses an empty rule with the usage, and «Отмена» remembers nothing', async () => {
    await say('/rule', true);
    expect(calls.at(-1)?.body.text).toContain('/rule в «Учусь играть»');
    await say(`/rule ${RULE}`, true);
    await tap(buttons().find((data) => data.endsWith(':x'))!);
    expect(await testDb().prepare('SELECT status FROM ai_rules').all()).toMatchObject({
      results: [{ status: 'disabled' }]
    });
    await say('Учусь играть на Пудже: промахнулся');
    await api.settle();
    expect(inputs[0]).not.toContain(RULE);
  });

  it('keeps at most ${RULES_IN_USE_MAX} rules in use, and lists every one under the message limit', async () => {
    for (let index = 0; index <= RULES_IN_USE_MAX; index += 1) {
      await say(`/rule ${String(index).padStart(2, '0')} ${'длинное правило '.repeat(18)}`, true);
      await tap(buttons().find((data) => data.endsWith(':a'))!);
    }
    const counts = await testDb()
      .prepare('SELECT status, count(*) AS n FROM ai_rules GROUP BY status ORDER BY status')
      .all<{ status: string; n: number }>();
    expect(counts.results).toEqual([
      { status: 'active', n: RULES_IN_USE_MAX },
      { status: 'pending_scope', n: 1 }
    ]);
    await say('/rules', true);
    const list = calls.filter((call) => call.method === 'sendMessage').at(-1)?.body.text ?? '';
    expect(list.length).toBeLessThan(4096);
    expect(buttons().filter((data) => data.endsWith(':off'))).toHaveLength(RULES_IN_USE_MAX);
  });

  it('puts an analysis rule into prompts only after «Учитывать», and «Нет» turns it down for good', async () => {
    const insert = (id: string, status: string) =>
      testDb()
        .prepare(
          `INSERT INTO ai_rules (id, text, scope, source, status, created_at, updated_at)
           VALUES (?1, ?2, 'igrat', 'analysis', ?3, 1, 1)`
        )
        .bind(id, `${RULE} ${status}`, status)
        .run();
    const ok = '00000000-0000-4000-8000-000000000001';
    const no = '00000000-0000-4000-8000-000000000002';
    const early = '00000000-0000-4000-8000-000000000003';
    await insert(ok, 'supported');
    await insert(no, 'strong');
    await insert(early, 'candidate');
    await tap(`rl:${early}:ok`);
    await tap(`rl:${no}:no`);
    await tap(`rl:${no}:ok`);
    await tap(`rl:${ok}:ok`);
    const statuses = await testDb()
      .prepare('SELECT id, status, approved_at IS NOT NULL AS approved FROM ai_rules ORDER BY id')
      .all<{ id: string; status: string; approved: number }>();
    expect(statuses.results).toEqual([
      { id: ok, status: 'supported', approved: 1 },
      { id: no, status: 'disabled', approved: 0 },
      { id: early, status: 'candidate', approved: 0 }
    ]);
    await say('/rules', true);
    expect(calls.filter((call) => call.method === 'sendMessage').at(-1)?.body.text).toContain('из аналитики');
    await say('Учусь играть на Пудже: промахнулся хуком');
    await api.settle();
    expect(inputs[0]).toContain(`${RULE} supported`);
    expect(inputs[0]).not.toContain(`${RULE} strong`);
    expect(inputs[0]).not.toContain(`${RULE} candidate`);
  });
});
