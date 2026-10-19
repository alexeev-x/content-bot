import { beforeEach, describe, expect, it } from 'vitest';
import { createD1SystemState } from '../../src/app/system-state';
import { sendContentAlerts } from '../../src/app/workflows/send-content-alerts';
import type { TelegramOwnerMessageApi } from '../../src/integrations/telegram/telegram-api';
import {
  collectContentAnalytics,
  type ConfiguredSources,
  createD1ContentAlertRepository,
  createD1ContentAnalyticsRepository,
  createD1ContentForecastRepository,
  raiseDailyReport
} from '../../src/modules/content-analytics';
import { zoned } from '../../src/modules/content-analytics/alerts';
import type { Collection } from '../../src/modules/content-analytics/types';
import { createD1SettingsRepository, saveOwnerOperationsSettings } from '../../src/modules/settings';
import { createLogger } from '../../src/platform/logging/logger';
import { fakeTransport, makeTick, tickCount } from '../helpers/dispatch';
import { testDb } from '../helpers/db';
import { type FakeClock, fakeClock, resetDb, START } from '../helpers/harness';

// The daily report (AI plan P6) end to end in a migrated D1: raised once per owner-zone day from its hour, the
// forecasts it shows stored and scored by the readings near their horizon, sent once with an unconfirmed send
// left `unknown`.

const HOUR = 60 * 60_000;
const ZONE = 'Europe/Moscow';
const logger = createLogger(() => undefined);

const youtube = (collect: () => Promise<Collection>): ConfiguredSources => ({
  collectors: [{ platform: 'youtube', handle: 'a', profileUrl: 'https://youtube.com/@a', requests: 1, collect }],
  handles: { youtube: { handle: 'a', profileUrl: 'https://youtube.com/@a' } },
  tiktok: null
});

function repos() {
  return {
    analytics: createD1ContentAnalyticsRepository(testDb()),
    alerts: createD1ContentAlertRepository(testDb()),
    forecasts: createD1ContentForecastRepository(testDb())
  };
}

/** Hourly collections of three young videos whose views grow by 100 an hour. */
async function collectHours(clock: FakeClock, hours: number, start: number) {
  const { analytics } = repos();
  for (let hour = 0; hour < hours; hour += 1) {
    const views = 1000 + 100 * (start + hour);
    await collectContentAnalytics({
      repo: analytics,
      sources: youtube(async () => ({
        followers: 10,
        items: [0, 1, 2].map((index) => ({
          externalId: String(index),
          title: `Ролик <${index}> | Учу фидить в доту`,
          url: `https://youtube.com/shorts/${index}`,
          thumbnailUrl: null,
          publishedAt: START - (index + 1) * 6 * HOUR,
          views: views + index,
          likes: null,
          comments: null,
          shares: null
        }))
      })),
      clock,
      logger,
      requestId: 't'
    });
    clock.advance(HOUR);
  }
}

const alertRows = () =>
  testDb()
    .prepare("SELECT id, status, html FROM content_alerts WHERE id LIKE 'daily:%' ORDER BY id")
    .all<{ id: string; status: string; html: string }>()
    .then((rows) => rows.results);

beforeEach(resetDb);

describe('daily report', () => {
  it('is raised once from its hour, stores its forecasts and shows the table without zeros', async () => {
    const clock = fakeClock();
    await collectHours(clock, 26, 0);
    const deps = { ...repos(), clock, timezone: ZONE };
    const localHour = zoned(clock.now(), ZONE).hour;
    if (localHour < 23) expect(await raiseDailyReport({ ...deps, hour: localHour + 1 })).toEqual({ raised: false });
    expect(await alertRows()).toEqual([]);

    // Two overlapping ticks: one report.
    const both = await Promise.all([raiseDailyReport({ ...deps, hour: 0 }), raiseDailyReport({ ...deps, hour: 0 })]);
    expect(both.filter((result) => result.raised)).toHaveLength(1);
    const [alert] = await alertRows();
    expect(alert?.id).toMatch(/^daily:\d{4}-\d{2}-\d{2}:v1$/);
    expect(alert?.html).toContain('<pre>');
    expect(alert?.html).toContain('Ролик &lt;0&gt;');
    expect(alert?.html).toContain('+2.4к');
    // TikTok was never collected: said in words, no zero row.
    expect(alert?.html).toContain('TikTok</b> · 0 последних\nДанных ещё нет');
    expect(alert?.html).toContain('частично');
    expect(Array.from(alert?.html ?? '').length).toBeLessThan(4096);
    const stored = await testDb()
      .prepare('SELECT COUNT(*) AS n FROM content_forecasts WHERE report_id = ?')
      .bind(alert?.id)
      .first<{ n: number }>();
    expect(stored?.n).toBe(9);
    expect(await raiseDailyReport({ ...deps, hour: 0 })).toEqual({ raised: false });
  });

  it('scores the forecasts by the readings near their horizon the next day', async () => {
    const clock = fakeClock();
    await collectHours(clock, 26, 0);
    await raiseDailyReport({ ...repos(), clock, timezone: ZONE, hour: 0 });
    // A day and the scoring delay later, with hourly readings in between.
    await collectHours(clock, 31, 26);
    await raiseDailyReport({ ...repos(), clock, timezone: ZONE, hour: 0 });
    const outcomes = await testDb()
      .prepare('SELECT horizon_hours AS hours, outcome, fact FROM content_forecasts WHERE scored_at IS NOT NULL')
      .all<{ hours: number; outcome: string; fact: number | null }>();
    expect(outcomes.results.length).toBe(3);
    expect(outcomes.results.every((row) => row.hours === 24 && row.fact !== null)).toBe(true);
    const reports = await alertRows();
    expect(reports).toHaveLength(2);
    expect(reports[1]?.html).toMatch(/📈 Прогнозы за сутки: \d из 3 в диапазоне \(пока мало, рано судить\)/);
  });

  it('is sent once: a lost answer leaves it unknown and it is never resent', async () => {
    const clock = fakeClock();
    await collectHours(clock, 3, 0);
    await raiseDailyReport({ ...repos(), clock, timezone: ZONE, hour: 0 });
    let calls = 0;
    const lost = {
      sendMessageWithKeyboard: async () => {
        calls += 1;
        throw new DOMException('timed out', 'TimeoutError');
      }
    } as unknown as TelegramOwnerMessageApi;
    const send = () =>
      sendContentAlerts({
        repo: repos().alerts,
        messenger: lost,
        ownerChatId: '42',
        appOrigin: 'https://studio.example.com',
        now: () => clock.now(),
        charge: () => {},
        logger
      });
    await send();
    await send();
    expect(calls).toBe(1);
    expect((await alertRows())[0]?.status).toBe('unknown');
  });
});

describe('daily report on the Cron tick', () => {
  // Regression (review 19.10.2026): the step once needed 49 of the tick's 50 statements and never ran.
  it('is raised on a minute-2 tick and sent on the next minute-8 tick', async () => {
    const clock = fakeClock(Date.UTC(2026, 9, 15, 10, 0));
    await collectHours(clock, 3, 0);
    await saveOwnerOperationsSettings(
      { repo: createD1SettingsRepository(testDb()), logger, requestId: 't', now: clock.now() },
      {
        actor: 'owner',
        input: {
          revision: 0,
          timezone: ZONE,
          notifications: {
            warningsEnabled: true,
            publicationAlerts: true,
            sourceAlerts: true,
            automationAlerts: true,
            recoveryAlerts: true,
            dotaWatchlistAlerts: true,
            scheduleNotices: true,
            sentNotices: true,
            dailyReport: true,
            dailyReportHour: 0
          }
        }
      }
    );
    await createD1SystemState(testDb()).rememberAppOrigin('https://studio.example.com', clock.now());
    const sources = youtube(async () => ({ followers: 10, items: [] }));
    const at = (minute: number) => {
      const now = Date.UTC(2026, 9, 15, 13, minute);
      return makeTick({
        clock: fakeClock(now),
        scheduledTime: now,
        transport: fakeTransport(),
        tweak: (container) => ({ ...container, contentSources: sources }) as typeof container
      });
    };
    const raise = at(2);
    await raise.run();
    expect(tickCount(raise, 'dailyReportRaised')).toBe(1);
    expect(raise.container.queryBudget.remaining()).toBeGreaterThanOrEqual(0);
    const send = at(8);
    await send.run();
    expect(send.ownerMessages.some((message) => message.html.includes('📊 Аналитика'))).toBe(true);
    expect((await alertRows())[0]?.status).toBe('sent');
  });
});
