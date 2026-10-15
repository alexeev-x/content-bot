import { GrammyError } from 'grammy';
import { beforeEach, describe, expect, it } from 'vitest';
import { sendContentAlerts } from '../../src/app/workflows/send-content-alerts';
import {
  createD1ContentAlertRepository,
  createD1ContentGoalRepository,
  raiseContentAlerts
} from '../../src/modules/content-analytics';
import { digestAlert, digestWeekEnd } from '../../src/modules/content-analytics/alerts';
import type { TelegramOwnerMessageApi } from '../../src/integrations/telegram/telegram-api';
import { createLogger } from '../../src/platform/logging/logger';
import { testDb } from '../helpers/db';
import { fakeClock, resetDb, START } from '../helpers/harness';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const TZ = 'Europe/Chisinau';
const logger = createLogger(() => undefined);

async function insertItem(input: {
  id: string;
  publishedAt: number;
  views: number;
  v3h?: number;
  v6h?: number;
  platform?: 'telegram' | 'tiktok';
}): Promise<void> {
  const platform = input.platform ?? 'tiktok';
  await testDb()
    .prepare(
      `INSERT INTO content_items (id, platform, title, url, published_at, views, observed_at, v3h, v6h)
       VALUES (?, ?, ?, 'https://example.test', ?, ?, ?, ?, ?)`
    )
    .bind(
      `${platform}:${input.id}`,
      platform,
      `Ролик ${input.id}`,
      input.publishedAt,
      input.views,
      START,
      input.v3h ?? null,
      input.v6h ?? null
    )
    .run();
}

async function alertRows(): Promise<{ id: string; status: string; error_code: string | null }[]> {
  const rows = await testDb()
    .prepare('SELECT id, status, error_code FROM content_alerts ORDER BY id')
    .all<{ id: string; status: string; error_code: string | null }>();
  return rows.results;
}

function messenger(behaviour: () => Promise<unknown>): TelegramOwnerMessageApi & { sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    sendMessageWithWebAppButton: async (_chat: string, { html }: { html: string }) => {
      sent.push(html);
      return behaviour();
    },
    sendMessageWithKeyboard: async () => undefined
  } as unknown as TelegramOwnerMessageApi & { sent: string[] };
}

function sendDeps(api: TelegramOwnerMessageApi, clock: { now(): number }) {
  return {
    repo: createD1ContentAlertRepository(testDb()),
    messenger: api,
    ownerChatId: '1',
    appOrigin: 'https://studio.test',
    now: () => clock.now(),
    charge: () => undefined,
    logger
  };
}

/** ru-RU groups digits with a no-break space. */
function spaces(text: string | undefined): string {
  return (text ?? '').replace(/[\u00a0\u202f]/g, ' ');
}

beforeEach(async () => {
  await resetDb();
});

describe('content alerts', () => {
  it('raises an item alert once per direction against the usual curve at the same age', async () => {
    const clock = fakeClock();
    // The usual TikTok curve: three earlier videos with 1 000 views at 6 h.
    for (const id of ['a', 'b', 'c']) await insertItem({ id, publishedAt: START - 10 * DAY, views: 9000, v6h: 1000 });
    await insertItem({ id: 'new', publishedAt: START - 6 * HOUR - 10 * 60_000, views: 2100, v3h: 900, v6h: 2100 });
    await insertItem({ id: 'calm', publishedAt: START - 6 * HOUR, views: 1000, v6h: 1000 });
    const repo = createD1ContentAlertRepository(testDb());

    expect(
      await raiseContentAlerts({ repo, goals: createD1ContentGoalRepository(testDb()), clock, timezone: TZ })
    ).toEqual({ raised: 1 });
    // An overlapping or later tick raises nothing new.
    expect(
      await raiseContentAlerts({ repo, goals: createD1ContentGoalRepository(testDb()), clock, timezone: TZ })
    ).toEqual({ raised: 0 });
    const [alert] = await repo.listPending(5);
    expect(alert).toMatchObject({
      id: 'item:tiktok:new:rising',
      title: 'Залетает: «Ролик new» в TikTok',
      linkPath: '/analytics?id=tiktok%3Anew'
    });
    expect(spaces(alert?.body)).toContain('2,1× обычного на 6 ч: 2 100 просмотров при обычных 1 000.');
  });

  it('raises a source outage after three hours of failures, once per outage', async () => {
    const clock = fakeClock();
    const repo = createD1ContentAlertRepository(testDb());
    await testDb()
      .prepare(
        `UPDATE content_sources SET last_success_at = ?, last_error_at = ?, last_error_code = 'TELEGRAM_HTTP_429'
         WHERE platform = 'telegram'`
      )
      .bind(START - 2 * HOUR, START - 10 * 60_000)
      .run();
    expect(
      await raiseContentAlerts({ repo, goals: createD1ContentGoalRepository(testDb()), clock, timezone: TZ })
    ).toEqual({ raised: 0 });
    clock.advance(HOUR + 60_000);
    expect(
      await raiseContentAlerts({ repo, goals: createD1ContentGoalRepository(testDb()), clock, timezone: TZ })
    ).toEqual({ raised: 1 });
    clock.advance(HOUR);
    expect(
      await raiseContentAlerts({ repo, goals: createD1ContentGoalRepository(testDb()), clock, timezone: TZ })
    ).toEqual({ raised: 0 });
    expect((await alertRows()).map((row) => row.id)).toEqual([`source:telegram:${START - 2 * HOUR}`]);
  });

  it('raises the digest on Monday after 10:00 in the owner zone, once a week', async () => {
    const monday = Date.parse('2027-01-18T09:30:00Z'); // 11:30 in Chisinau (UTC+2)
    const clock = fakeClock(Date.parse('2027-01-18T07:30:00Z')); // 09:30 there: too early
    const repo = createD1ContentAlertRepository(testDb());
    await insertItem({ id: 'w1', platform: 'telegram', publishedAt: monday - 4 * DAY, views: 900 });
    await insertItem({ id: 'w2', platform: 'telegram', publishedAt: monday - 5 * DAY, views: 300 });
    await insertItem({ id: 'p1', platform: 'telegram', publishedAt: monday - 10 * DAY, views: 300 });
    await insertItem({ id: 'p2', platform: 'telegram', publishedAt: monday - 11 * DAY, views: 300 });
    expect(
      await raiseContentAlerts({ repo, goals: createD1ContentGoalRepository(testDb()), clock, timezone: TZ })
    ).toEqual({ raised: 0 });

    clock.set(monday);
    expect(
      await raiseContentAlerts({ repo, goals: createD1ContentGoalRepository(testDb()), clock, timezone: TZ })
    ).toEqual({ raised: 1 });
    clock.advance(HOUR);
    expect(
      await raiseContentAlerts({ repo, goals: createD1ContentGoalRepository(testDb()), clock, timezone: TZ })
    ).toEqual({ raised: 0 });
    const [digest] = await repo.listPending(5);
    expect(digest?.id).toBe('digest:2027-01-18');
    expect(digest?.title).toBe('Итоги недели 11 янв. — 17 янв.');
    expect(spaces(digest?.body)).toContain('Публикаций: 2, на прошлой неделе 2.');
    expect(digest?.body).toContain('1. «Ролик w1», Telegram: 900 (3×)');
  });

  it('keeps the digest week Monday to Sunday across a DST change', () => {
    // Chisinau leaves summer time on Sunday 25.10.2026: that week is 169 hours long.
    const now = Date.parse('2026-10-26T09:00:00Z');
    const weekEnd = digestWeekEnd(now, TZ);
    expect(weekEnd).toBe(Date.parse('2026-10-25T22:00:00Z'));
    const digest = digestAlert({ items: [], checkpoints: [], followers: [], weekEnd: weekEnd!, now, timezone: TZ });
    expect(digest.title).toBe('Итоги недели 19 окт. — 25 окт.');
    const withGoal = digestAlert({
      items: [],
      checkpoints: [],
      followers: [],
      goals: [
        {
          platform: 'telegram',
          target: 1000,
          followers: 900,
          perWeek: 35,
          forecastDay: '2026-11-15',
          reached: false,
          setAt: new Date(now).toISOString()
        }
      ],
      weekEnd: weekEnd!,
      now,
      timezone: TZ
    });
    expect(spaces(withGoal.body)).toContain('Цель Telegram: 900 из 1 000, +35 в неделю, при таком темпе к 15 нояб.');
  });

  it('sends each alert once: a rejection fails, a lost answer stays unknown, a stuck send becomes unknown', async () => {
    const clock = fakeClock();
    const repo = createD1ContentAlertRepository(testDb());
    await repo.insert(
      ['a', 'b', 'c'].map((id) => ({
        id: `item:tiktok:${id}:rising`,
        kind: 'item',
        title: `T ${id}`,
        body: '<b>',
        linkPath: '/analytics'
      })),
      START
    );

    const ok = messenger(async () => ({}));
    expect(await sendContentAlerts(sendDeps(ok, clock))).toEqual({ sent: 2, failed: 0, unknown: 0 });
    expect(ok.sent[0]).toBe('<b>T a</b>\n&lt;b&gt;');

    const rejected = messenger(async () => {
      throw new GrammyError(
        'Bad Request',
        { ok: false, error_code: 400, description: 'Bad Request' },
        'sendMessage',
        {}
      );
    });
    expect(await sendContentAlerts(sendDeps(rejected, clock))).toEqual({ sent: 0, failed: 1, unknown: 0 });
    // Nothing left to send: a failed alert is never retried.
    expect(await sendContentAlerts(sendDeps(ok, clock))).toEqual({ sent: 0, failed: 0, unknown: 0 });

    await repo.insert([{ id: 'digest:x', kind: 'digest', title: 'D', body: 'B', linkPath: '/analytics' }], START);
    const lost = messenger(async () => {
      throw new Error('timeout');
    });
    expect(await sendContentAlerts(sendDeps(lost, clock))).toEqual({ sent: 0, failed: 0, unknown: 1 });

    await repo.insert([{ id: 'digest:y', kind: 'digest', title: 'D', body: 'B', linkPath: '/analytics' }], START);
    expect(await repo.claim('digest:y', clock.now())).toBe(true);
    clock.advance(3 * 60_000);
    expect(await sendContentAlerts(sendDeps(ok, clock))).toEqual({ sent: 0, failed: 0, unknown: 1 });

    expect(await alertRows()).toEqual([
      { id: 'digest:x', status: 'unknown', error_code: 'TELEGRAM_RESULT_UNKNOWN' },
      { id: 'digest:y', status: 'unknown', error_code: 'WORKER_INTERRUPTED' },
      { id: 'item:tiktok:a:rising', status: 'sent', error_code: null },
      { id: 'item:tiktok:b:rising', status: 'sent', error_code: null },
      { id: 'item:tiktok:c:rising', status: 'failed', error_code: 'TELEGRAM_REJECTED' }
    ]);
  });
});
