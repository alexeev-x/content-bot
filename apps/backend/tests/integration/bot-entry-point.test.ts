import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createD1UpdateDedup, UPDATE_RETENTION_MS } from '../../src/app/bot/update-dedup';
import { createD1SystemState } from '../../src/app/system-state';
import { RANGE_SUMMARY_SQL, UPCOMING_SQL } from '../../src/modules/publishing/infrastructure/d1-publication-repository';
import { testDb } from '../helpers/db';
import { expectError } from '../helpers/expect-error';
import { fakeBotAdminApi } from '../helpers/fake-bot-admin-api';
import { fakeTransport, makeTick, SENT, seedDueJob } from '../helpers/dispatch';
import {
  type Api,
  createApi,
  fakeClock,
  type FakeClock,
  OWNER_ID,
  OWNER_TOKEN,
  resetDb,
  seedSession,
  START
} from '../helpers/harness';
import { meteredDb, type Meter } from '../helpers/metered-db';
import { count, seedApprovedPost, seedDestination, seedPublication } from '../helpers/publishing';

const SECRET = 'hook-secret-PLACEHOLDER';
const BOT_INFO = JSON.stringify({ id: 123456, is_bot: true, first_name: 'Bot', username: 'content_bot' });
const ORIGIN = 'https://studio.example.com';
const HOUR = 60 * 60_000;

let clock: FakeClock;
let api: Api;
let meter: Meter;
let replies: { chat_id: number; text: string; parse_mode?: string; reply_markup?: unknown }[];
let logLines: string[];

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * 24 * HOUR });
  clock = fakeClock();
  const metered = meteredDb(testDb());
  meter = metered.meter;
  api = createApi({
    clock,
    botInfo: BOT_INFO,
    webhookSecret: SECRET,
    botAdminApi: fakeBotAdminApi(),
    db: metered.db
  });
  replies = [];
  logLines = [];
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    logLines.push(String(line));
  });
  vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
    replies.push(JSON.parse(String(init?.body ?? '{}')) as (typeof replies)[number]);
    return Promise.resolve(Response.json({ ok: true, result: { message_id: 1 } }));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

let updateCounter = 1000;
function textUpdate(
  text: string,
  extra: { from?: number; updateId?: number; forwarded?: boolean; command?: boolean } = {}
) {
  const from = extra.from ?? Number(OWNER_ID);
  return {
    update_id: extra.updateId ?? ++updateCounter,
    message: {
      message_id: 10,
      date: 1,
      chat: { id: from, type: 'private', first_name: 'X' },
      from: { id: from, is_bot: false, first_name: 'X' },
      text,
      ...(extra.command === true ? { entities: [{ type: 'bot_command', offset: 0, length: text.length }] } : {}),
      ...(extra.forwarded === true
        ? {
            forward_origin: { type: 'channel', date: 1, chat: { id: -100, type: 'channel', title: 'C' }, message_id: 3 }
          }
        : {})
    }
  };
}

const deliver = (update: unknown, secret: string | null = SECRET) =>
  api.request(`${ORIGIN}/webhooks/telegram`, {
    method: 'POST',
    token: null,
    json: update,
    headers: secret === null ? {} : { 'x-telegram-bot-api-secret-token': secret }
  });

const command = (name: string) => textUpdate(`/${name}`, { command: true });

interface ReplyButton {
  text: string;
  web_app: { url: string };
}
const buttonOf = (reply: (typeof replies)[number] | undefined): ReplyButton | undefined =>
  (reply?.reply_markup as { inline_keyboard: ReplyButton[][] } | undefined)?.inline_keyboard[0]?.[0];

describe('a text from the owner becomes a draft', () => {
  it('stores a forwarded text with emoji exactly, and replies with an Open button to the post', async () => {
    const text = 'Релиз 7.40 🚀\n\nГерои 👩‍💻 и 𝒳 баланс\n- первое';
    const response = await deliver(textUpdate(text, { forwarded: true }));

    expect(response.status).toBe(200);
    const rows = await testDb().prepare('SELECT id, title, body, status, revision FROM posts').all<{
      id: string;
      title: string;
      body: string;
      status: string;
      revision: number;
    }>();
    expect(rows.results).toEqual([
      {
        id: expect.any(String),
        title: 'Релиз 7.40 🚀',
        body: 'Герои 👩‍💻 и 𝒳 баланс\n- первое',
        status: 'draft',
        revision: 0
      }
    ]);
    const postId = rows.results[0]?.id ?? '';
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ chat_id: Number(OWNER_ID), text: 'Черновик создан' });
    expect(buttonOf(replies[0])).toEqual({
      text: 'Открыть в Студии',
      web_app: { url: `${ORIGIN}/posts/${postId}/publish` }
    });
    const audit = await testDb()
      .prepare("SELECT actor_telegram_id FROM audit_log WHERE entity_id = ?1 AND action = 'post.create'")
      .bind(postId)
      .all();
    expect(audit.results).toEqual([{ actor_telegram_id: OWNER_ID }]);
  });

  it('keeps a body of exactly the contract limit and refuses one unit more, without a draft', async () => {
    await deliver(textUpdate(`Заголовок\n${'😀'.repeat(2048)}`));
    expect(await count('posts')).toBe(1);

    await deliver(textUpdate(`Заголовок\n${'😀'.repeat(2049)}`));
    expect(await count('posts')).toBe(1);
    expect(replies.at(-1)?.text).toBe('Текст длиннее 4096 символов, черновик не создан.');
  });

  it('processes a repeated update_id once: one draft, one reply, one stored id', async () => {
    const update = textUpdate('Один раз', { updateId: 9001 });

    const [first, second] = await Promise.all([deliver(update), deliver(update)]);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(await count('posts')).toBe(1);
    expect(replies).toHaveLength(1);
    expect(await count('webhook_updates')).toBe(1);
    await deliver(update);
    expect(await count('posts')).toBe(1);
    expect(replies).toHaveLength(1);
  });

  it('ignores a stranger completely: no draft, no stored update id, no Telegram call', async () => {
    const response = await deliver(textUpdate('Спам', { from: 777 }));

    expect(response.status).toBe(200);
    expect(await count('posts')).toBe(0);
    expect(await count('webhook_updates')).toBe(0);
    expect(replies).toEqual([]);
  });

  it('answers 503 without a crash, a draft or a Telegram call when the bot has no token', async () => {
    api = createApi({ clock, botToken: null, botInfo: BOT_INFO, webhookSecret: SECRET });

    await expectError(await deliver(textUpdate('Текст')), 503, 'UNAVAILABLE');

    expect(await count('posts')).toBe(0);
    expect(replies).toEqual([]);
  });

  it('rejects a wrong secret before anything is stored', async () => {
    await expectError(await deliver(textUpdate('Текст'), 'wrong-secret'), 401, 'UNAUTHORIZED');
    await expectError(await deliver(textUpdate('Текст'), null), 401, 'UNAUTHORIZED');
    expect(await count('posts')).toBe(0);
    expect(await count('webhook_updates')).toBe(0);
  });
});

async function seedPlan(): Promise<{ later: string; sooner: string }> {
  const sent = await seedDueJob(api, { title: 'Ушло' });
  await makeTick({ clock, transport: fakeTransport(SENT) }).run();
  const channelA = await seedDestination(api, { title: 'Канал А' });
  const channelB = await seedDestination(api, { title: 'Канал Б' });
  const first = await seedApprovedPost(api, 'Первый');
  const second = await seedApprovedPost(api, 'Второй <b>');
  const later = await seedPublication(api, {
    postId: first.id,
    revision: first.revision,
    destinationId: channelA.id,
    scheduledAt: new Date(START + 3 * HOUR).toISOString()
  });
  const sooner = await seedPublication(api, {
    postId: second.id,
    revision: second.revision,
    destinationId: channelB.id,
    scheduledAt: new Date(START + HOUR).toISOString()
  });
  expect(sent.publicationId).not.toBe(later.id);
  return { later: later.id, sooner: sooner.id };
}

describe('the owner commands over the webhook', () => {
  it('/today counts the plan and the results of the day in the zone of the latest publication', async () => {
    await seedPlan();

    await deliver(command('today'));

    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ parse_mode: 'HTML' });
    expect(replies[0]?.text).toBe(
      [
        '<b>Сегодня, 15 января</b> (Europe/Moscow)',
        '',
        'План: ждут отправки 2, ближайшая в 12:00.',
        'Итоги: отправлено 1.'
      ].join('\n')
    );
    expect(buttonOf(replies[0])).toEqual({ text: 'Открыть студию', web_app: { url: `${ORIGIN}/` } });
  });

  it('/today with nothing scheduled says so, in Europe/Moscow', async () => {
    await deliver(command('today'));

    expect(replies[0]?.text).toBe(
      ['<b>Сегодня, 15 января</b> (Europe/Moscow)', '', 'На сегодня публикаций нет.'].join('\n')
    );
  });

  it('/today uses the zone of the latest publication', async () => {
    await api.request('/api/v1/settings/operations', {
      method: 'PUT',
      json: {
        revision: 0,
        timezone: 'Asia/Tokyo',
        notifications: {
          warningsEnabled: true,
          publicationAlerts: true,
          sourceAlerts: true,
          automationAlerts: true,
          recoveryAlerts: true,
          dotaWatchlistAlerts: true
        }
      }
    });
    const post = await seedApprovedPost(api, 'Токио');
    const channel = await seedDestination(api);
    await seedPublication(api, {
      postId: post.id,
      revision: post.revision,
      destinationId: channel.id,
      scheduledAt: new Date(START + 2 * HOUR).toISOString(),
      timezone: 'Asia/Tokyo'
    });

    await deliver(command('today'));

    // 2027-01-15 08:00Z is 17:00 in Tokyo, the same day; the publication is at 19:00 there.
    expect(replies[0]?.text).toContain('(Asia/Tokyo)');
    expect(replies[0]?.text).toContain('ближайшая в 19:00');
  });

  it('/next lists the next five, earliest first, escaped, with a button to the scheduled ones', async () => {
    await seedPlan();

    await deliver(command('next'));

    expect(replies[0]?.text).toBe(
      [
        '<b>Ближайшие публикации</b> (Europe/Moscow)',
        '',
        '1. 15 янв., 12:00 · Канал Б · Второй &lt;b&gt;',
        '2. 15 янв., 14:00 · Канал А · Первый'
      ].join('\n')
    );
    expect(buttonOf(replies[0])).toEqual({
      text: 'Все запланированные',
      web_app: { url: `${ORIGIN}/publications?status=scheduled` }
    });
  });

  it('/next lists at most five of seven', async () => {
    const channel = await seedDestination(api);
    for (let i = 0; i < 7; i += 1) {
      const post = await seedApprovedPost(api, `Пост ${i}`);
      await seedPublication(api, {
        postId: post.id,
        revision: post.revision,
        destinationId: channel.id,
        scheduledAt: new Date(START + (i + 1) * HOUR).toISOString()
      });
    }

    await deliver(command('next'));

    const lines = (replies[0]?.text ?? '').split('\n').filter((line) => /^\d\./.test(line));
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain('Пост 0');
    expect(lines[4]).toContain('Пост 4');
  });

  it('/next with nothing waiting says so', async () => {
    await deliver(command('next'));
    expect(replies[0]?.text).toBe('Запланированных публикаций нет.');
  });

  it('/status reports publishing, the last Cron run and the open problems, and links to the failed ones', async () => {
    await seedDueJob(api, { title: 'Не ушло' });
    await makeTick({
      clock,
      transport: fakeTransport({ kind: 'rejected', code: 'DESTINATION_UNAVAILABLE' })
    }).run();
    clock.advance(5 * 60_000);

    await deliver(command('status'));

    expect(replies[0]?.text).toBe(
      [
        '<b>Статус</b>',
        '',
        'Публикация: выключена',
        'Cron: последний запуск 5 мин назад, без ошибок (давно: проверьте Cron)',
        'Проблемы: неизвестно 0, не отправлено 1, открытых инцидентов 1'
      ].join('\n')
    );
    expect(buttonOf(replies[0])).toEqual({
      text: 'Разобраться',
      web_app: { url: `${ORIGIN}/publications?status=failed` }
    });
  });

  it('/status with nothing wrong says so and opens the studio', async () => {
    await makeTick({ clock, transport: fakeTransport(SENT) }).run();

    await deliver(command('status'));

    expect(replies[0]?.text).toContain('Cron: последний запуск только что, без ошибок');
    expect(replies[0]?.text).toContain('Проблемы: проблем нет');
    expect(buttonOf(replies[0])?.web_app.url).toBe(`${ORIGIN}/`);
  });

  it('/status links to the unknown ones first, and says when Cron has never run', async () => {
    await seedDueJob(api);
    await makeTick({ clock, transport: fakeTransport({ kind: 'unknown', reason: 'timeout' }) }).run();
    await testDb().prepare('DELETE FROM system_state').run();

    await deliver(command('status'));

    expect(replies[0]?.text).toContain('Cron: нет данных о запусках');
    expect(replies[0]?.text).toContain('неизвестно 1');
    expect(buttonOf(replies[0])?.web_app.url).toBe(`${ORIGIN}/publications?status=unknown`);
  });

  it('answers every command from the owner only', async () => {
    for (const name of ['today', 'next', 'status']) {
      await deliver(textUpdate(`/${name}`, { from: 777, command: true }));
    }
    expect(replies).toEqual([]);
  });

  it.each([
    ['today', 8],
    ['next', 8],
    ['status', 8]
  ])('/%s costs a handful of D1 statements, all bounded', async (name, budget) => {
    await seedPlan();
    const before = meter.statements;
    const sqlBefore = meter.sql.length;

    await deliver(command(name));

    expect(meter.statements - before).toBeLessThanOrEqual(budget);
    const unbounded = meter.sql
      .slice(sqlBefore)
      .filter((statement) => /^\s*SELECT\b/i.test(statement))
      .filter((statement) => !/\bLIMIT\b/i.test(statement))
      // Primary-key lookups: the bot identity is not read (BOT_INFO is set); a revision, a cron row, a destination.
      .filter((statement) => !/WHERE (key|id|post_id)\s*=/i.test(statement));
    expect(unbounded).toEqual([]);
  });
});

describe('the Worker origin Cron needs', () => {
  it('/start stores it, and a second /start rewrites nothing', async () => {
    await deliver(command('start'));
    await api.settle();
    const first = await testDb().prepare("SELECT value, updated_at FROM system_state WHERE key = 'app_origin'").first();
    expect(first).toEqual({ value: JSON.stringify({ origin: ORIGIN }), updated_at: START });

    clock.advance(1_000);
    await deliver(command('start'));
    await api.settle();
    const second = await testDb()
      .prepare("SELECT value, updated_at FROM system_state WHERE key = 'app_origin'")
      .first();
    expect(second).toEqual(first);
  });

  it('Settings -> Bot -> Connect stores it as well', async () => {
    const response = await api.request(`${ORIGIN}/api/v1/bot/connect`, { method: 'POST', json: {} });
    expect(response.status).toBe(200);
    expect(await createD1SystemState(testDb()).readAppOrigin()).toBe(ORIGIN);
  });
});

async function planOf(sql: string, ...bindings: (string | number)[]): Promise<string> {
  const { results } = await testDb()
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .bind(...bindings)
    .all<{ detail: string }>();
  return results.map((row) => row.detail).join('\n');
}

describe('queries behind the owner commands and alerts', () => {
  it('the upcoming list walks the jobs_due partial index, never scans jobs or publications', async () => {
    const plan = await planOf(UPCOMING_SQL, 5);
    expect(plan).toContain('USING INDEX jobs_due');
    expect(plan).not.toMatch(/SCAN (jobs|publications)\b/);
  });

  it('the day summary reads the day from publications_scheduled_idx', async () => {
    const plan = await planOf(RANGE_SUMMARY_SQL, START, START + 24 * HOUR, START);
    expect(plan).toContain('INDEX publications_scheduled_idx (scheduled_at>? AND scheduled_at<?)');
    expect(plan).not.toMatch(/SCAN publications\b/);
  });

  it('the open-incident count walks incidents_open_idx', async () => {
    const plan = await planOf(
      'SELECT count(*) AS n FROM (SELECT 1 FROM incidents WHERE resolved_at IS NULL LIMIT ?1)',
      21
    );
    expect(plan).toContain('incidents_open_idx');
  });

  it('claiming alerts is a primary-key lookup per id', async () => {
    const plan = await planOf(
      `UPDATE incidents SET owner_notified_at = ?1 WHERE id IN (SELECT value FROM json_each(?2)) AND owner_notified_at IS NULL RETURNING id`,
      START,
      '[]'
    );
    expect(plan).toMatch(/SEARCH incidents USING (INTEGER )?PRIMARY KEY|USING INDEX sqlite_autoindex_incidents/);
  });
});

describe('webhook update ids', () => {
  it('records the first sight once and keeps the table small by deleting a few old rows per claim', async () => {
    const dedup = createD1UpdateDedup(testDb());
    const old = START - UPDATE_RETENTION_MS - 1;
    for (let id = 1; id <= 7; id += 1) {
      await testDb()
        .prepare('INSERT INTO webhook_updates (update_id, received_at) VALUES (?1, ?2)')
        .bind(id, old)
        .run();
    }

    expect(await dedup.claim(100, START)).toBe(true);
    // Five of the seven old rows went with the insert; the new id stays.
    expect(await count('webhook_updates')).toBe(7 + 1 - 5);
    expect(await dedup.claim(100, START)).toBe(false);
    expect(await count('webhook_updates')).toBe(1);
    expect(await count('webhook_updates', 'update_id = 100')).toBe(1);
  });
});
