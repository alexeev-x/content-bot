import { GrammyError } from 'grammy';
import { beforeEach, describe, expect, it } from 'vitest';
import { sendContentAlerts } from '../../src/app/workflows/send-content-alerts';
import { createD1ContentAlertRepository, raiseContentAlerts } from '../../src/modules/content-analytics';
import { itemAlerts } from '../../src/modules/content-analytics/alerts';
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
    sendMessageWithKeyboard: async (_chat: string, { html }: { html: string }) => {
      sent.push(html);
      return behaviour();
    }
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

    expect(await raiseContentAlerts({ repo, clock, timezone: TZ })).toEqual({ raised: 1 });
    // An overlapping or later tick raises nothing new.
    expect(await raiseContentAlerts({ repo, clock, timezone: TZ })).toEqual({ raised: 0 });
    const [alert] = await repo.listPending(5);
    expect(alert).toMatchObject({
      id: 'item:tiktok:new:rising',
      title: 'Залетает: «Ролик new» в TikTok',
      linkPath: '/analytics?id=tiktok%3Anew'
    });
    expect(spaces(alert?.body)).toContain('2,1× обычного на 6 ч: 2 100 просмотров при обычных 1 000.');
    expect(spaces(alert?.html ?? undefined)).toContain('🚀 <b>Залетает</b> · TikTok\n«Ролик new»');
    expect(spaces(alert?.html ?? undefined)).toContain('<b>2,1×</b> обычного за 6 ч');
  });

  it('words a weak item without its ratio and drops hashtags from titles', () => {
    const item = {
      id: 'youtube:w',
      platform: 'youtube' as const,
      title: 'Пудж <мид> #dota2 #shorts',
      url: 'https://example.test',
      thumbnailUrl: null,
      publishedAt: START - 6 * HOUR,
      views: 300,
      likes: null,
      comments: null,
      shares: null,
      observedAt: START
    };
    const at6 = (id: string, views: number) => ({
      id,
      platform: 'youtube' as const,
      publishedAt: 0,
      views: { 1: null, 3: null, 6: views, 12: null, 24: null, 48: null, 72: null },
      contaminated: false,
      title: 'ролик'
    });
    const [weak] = itemAlerts(
      [item],
      [at6('youtube:a', 1000), at6('youtube:b', 1000), at6('youtube:c', 1000), at6(item.id, 300)]
    );
    expect(weak?.id).toBe('item:youtube:w:below');
    expect(weak?.html).toContain('«Пудж &lt;мид&gt;»');
    expect(weak?.html).not.toContain('#');
    expect(weak?.html).not.toContain('×');
  });

  it('flags a TikTok video that stopped dead or vanished, once each, with a link to appeal', async () => {
    const clock = fakeClock();
    const repo = createD1ContentAlertRepository(testDb());
    const db = testDb();
    const item = (id: string, publishedAt: number, views: number, observedAt: number) =>
      db
        .prepare(
          `INSERT INTO content_items (id, platform, title, url, published_at, views, observed_at)
           VALUES (?, 'tiktok', ?, ?, ?, ?, ?)`
        )
        .bind(
          `tiktok:${id}`,
          `Ролик ${id} #dota2`,
          `https://www.tiktok.com/@a/video/${id}`,
          publishedAt,
          views,
          observedAt
        )
        .run();
    const snapshot = (id: string, at: number, views: number) =>
      db
        .prepare('INSERT INTO content_item_snapshots (item_id, observed_at, views) VALUES (?, ?, ?)')
        .bind(`tiktok:${id}`, at, views)
        .run();
    await db
      .prepare(
        `UPDATE content_sources SET last_success_at = ?, last_error_at = NULL, last_error_code = NULL WHERE platform = 'tiktok'`
      )
      .bind(START - 5 * 60_000)
      .run();
    // Grew 400 in the 6 hours before, then nothing for 6 hours.
    await item('frozen', START - 30 * HOUR, 1000, START - 5 * 60_000);
    await snapshot('frozen', START - 12 * HOUR - 5 * 60_000, 600);
    await snapshot('frozen', START - 6 * HOUR - 5 * 60_000, 1000);
    // Still growing: no alert.
    await item('alive', START - 30 * HOUR, 1500, START - 5 * 60_000);
    await snapshot('alive', START - 12 * HOUR - 5 * 60_000, 600);
    await snapshot('alive', START - 6 * HOUR - 5 * 60_000, 1000);
    // The last collection did not return it.
    await item('gone', START - 5 * HOUR, 800, START - 3 * HOUR);

    await raiseContentAlerts({ repo, clock, timezone: TZ });
    await raiseContentAlerts({ repo, clock, timezone: TZ });
    const alerts = await repo.listPending(10);
    expect(alerts.map((alert) => alert.id).sort()).toEqual(['item:tiktok:frozen:stalled', 'item:tiktok:gone:gone']);
    const frozen = alerts.find((alert) => alert.id.endsWith(':stalled'));
    expect(frozen?.html).toContain('⛔ <b>Ролик перестал набирать</b> · TikTok\n«Ролик frozen»');
    expect(frozen?.html).toContain('за последние 6 ч: +0');
    expect(frozen?.html).toContain('<a href="https://www.tiktok.com/@a/video/frozen">Открыть в TikTok</a>');
    // Only the owner's tap confirms a restriction or a removal: the alert carries the button, never the mark.
    expect(frozen?.buttons).toEqual([{ text: 'Ограничение подтвердилось', callbackData: 'cc:r:tiktok:frozen' }]);
    expect(alerts.find((alert) => alert.id.endsWith(':gone'))?.buttons).toEqual([
      { text: 'Удаление подтвердилось', callbackData: 'cc:d:tiktok:gone' }
    ]);
    const markups: unknown[] = [];
    const api = {
      sendMessageWithKeyboard: async (_chat: string, { markup }: { markup: unknown }) => {
        markups.push(markup);
        return {};
      }
    } as unknown as TelegramOwnerMessageApi;
    await sendContentAlerts(sendDeps(api, clock));
    expect(JSON.stringify(markups)).toContain(
      '{"text":"Ограничение подтвердилось","callback_data":"cc:r:tiktok:frozen"}'
    );
    expect(await testDb().prepare('SELECT COUNT(*) AS n FROM content_item_contamination').first('n')).toBe(0);
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
    expect(await raiseContentAlerts({ repo, clock, timezone: TZ })).toEqual({ raised: 0 });
    clock.advance(HOUR + 60_000);
    expect(await raiseContentAlerts({ repo, clock, timezone: TZ })).toEqual({ raised: 1 });
    clock.advance(HOUR);
    expect(await raiseContentAlerts({ repo, clock, timezone: TZ })).toEqual({ raised: 0 });
    expect((await alertRows()).map((row) => row.id)).toEqual([`source:telegram:${START - 2 * HOUR}`]);
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
        // An alert raised before migration 0049 has no HTML: its text is escaped.
        html: null,
        buttons: [],
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

    await repo.insert(
      [
        { id: 'digest:x', kind: 'digest', title: 'D', body: 'B', html: '<b>D</b>', buttons: [], linkPath: '/analytics' }
      ],
      START
    );
    const lost = messenger(async () => {
      throw new Error('timeout');
    });
    expect(await sendContentAlerts(sendDeps(lost, clock))).toEqual({ sent: 0, failed: 0, unknown: 1 });

    await repo.insert(
      [
        { id: 'digest:y', kind: 'digest', title: 'D', body: 'B', html: '<b>D</b>', buttons: [], linkPath: '/analytics' }
      ],
      START
    );
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
