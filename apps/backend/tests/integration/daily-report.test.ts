import { beforeEach, describe, expect, it } from 'vitest';
import { createD1SystemState } from '../../src/app/system-state';
import { runDailyReview } from '../../src/app/workflows/daily-review';
import { sendContentAlerts } from '../../src/app/workflows/send-content-alerts';
import type { TelegramOwnerMessageApi } from '../../src/integrations/telegram/telegram-api';
import { type AiTextProvider, createD1AiRepository, updateAiSettings } from '../../src/modules/ai';
import {
  collectContentAnalytics,
  type ConfiguredSources,
  createD1ContentAlertRepository,
  createD1ContentAnalyticsRepository,
  createD1ContentDailyReportRepository,
  createD1ContentForecastRepository,
  raiseDailyReport,
  releaseDailyReport,
  releaseOverdueReports
} from '../../src/modules/content-analytics';
import { zoned } from '../../src/modules/content-analytics/alerts';
import type { Collection } from '../../src/modules/content-analytics/types';
import { createD1SettingsRepository, saveOwnerOperationsSettings } from '../../src/modules/settings';
import { createLogger } from '../../src/platform/logging/logger';
import { testDb } from '../helpers/db';
import { fakeTransport, makeTick, tickCount } from '../helpers/dispatch';
import { type FakeClock, fakeClock, resetDb, START } from '../helpers/harness';

// The daily report (AI plan P6) end to end in a migrated D1: its numbers stored once per owner-zone day from its
// hour, the AI review queued and released with the message, the numbers alone after the deadline, the
// forecasts scored by the readings near their horizon, and the message sent once.

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
    forecasts: createD1ContentForecastRepository(testDb()),
    reports: createD1ContentDailyReportRepository(testDb())
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
          url: `https://youtube.com/shorts/${index}?feature=share`,
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

const reportRows = () =>
  testDb()
    .prepare('SELECT id, status, review, review_error AS reviewError FROM content_daily_reports ORDER BY id')
    .all<{ id: string; status: string; review: string | null; reviewError: string | null }>()
    .then((rows) => rows.results);

const REVIEW = {
  summary: 'День ровный.',
  rising: [{ video: 'Y1', note: 'растёт стабильно' }],
  weak: [],
  next: 'Начать с косяка.'
};

beforeEach(resetDb);

describe('daily report', () => {
  it('stores the day once from its hour and the forecasts it shows; nothing is sent before release', async () => {
    const clock = fakeClock();
    await collectHours(clock, 26, 0);
    const deps = { ...repos(), clock, timezone: ZONE };
    const localHour = zoned(clock.now(), ZONE).hour;
    if (localHour < 23) expect(await raiseDailyReport({ ...deps, hour: localHour + 1 })).toEqual({ reportId: null });

    // Two overlapping ticks: one report.
    const both = await Promise.all([raiseDailyReport({ ...deps, hour: 0 }), raiseDailyReport({ ...deps, hour: 0 })]);
    const ids = both.map((result) => result.reportId).filter((id) => id !== null);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(/^daily:\d{4}-\d{2}-\d{2}:v1$/);
    expect(await reportRows()).toMatchObject([{ status: 'waiting' }]);
    expect(await alertRows()).toEqual([]);
    const stored = await testDb()
      .prepare('SELECT COUNT(*) AS n FROM content_forecasts WHERE report_id = ?')
      .bind(ids[0])
      .first<{ n: number }>();
    expect(stored?.n).toBe(9);
    expect(await raiseDailyReport({ ...deps, hour: 0 })).toEqual({ reportId: null });
  });

  it('releases once with the review; a late second release changes nothing', async () => {
    const clock = fakeClock();
    await collectHours(clock, 26, 0);
    const deps = repos();
    const { reportId } = await raiseDailyReport({ ...deps, clock, timezone: ZONE, hour: 0 });
    const release = { reports: deps.reports, alerts: deps.alerts, now: clock.now() };
    expect(
      await releaseDailyReport(release, { id: reportId!, review: REVIEW, reviewError: null, model: 'gpt-6.1-sol' })
    ).toBe(true);
    expect(
      await releaseDailyReport(release, { id: reportId!, review: null, reviewError: 'REVIEW_TIMEOUT', model: null })
    ).toBe(false);
    const [alert] = await alertRows();
    expect(alert?.html).toContain('<b>🧠 Разбор</b>\nДень ровный.');
    expect(alert?.html).toMatch(
      /1\. Ролик &lt;0&gt; · \d+ ч\n {4}<a href="https:\/\/youtube\.com\/shorts\/0">▶️<\/a> 3\.5к \+2\.4к/
    );
    expect(alert?.html).toContain('За сутки: ▶️ +7.2к');
    expect(alert?.html).toContain('href="https://youtube.com/shorts/0"');
    expect(alert?.html).toContain('🎵 данных ещё нет: источник не собирался.');
    expect(Array.from(alert?.html ?? '').length).toBeLessThan(4096);
    expect(await reportRows()).toMatchObject([{ status: 'reviewed', reviewError: null }]);
  });

  it('sends the numbers alone when the review would not fit one Telegram message (review 19.10.2026)', async () => {
    const clock = fakeClock();
    await collectHours(clock, 3, 0);
    const deps = repos();
    const { reportId } = await raiseDailyReport({ ...deps, clock, timezone: ZONE, hour: 0 });
    const long = { ...REVIEW, summary: 'очень длинно '.repeat(400) };
    expect(
      await releaseDailyReport(
        { reports: deps.reports, alerts: deps.alerts, now: clock.now() },
        { id: reportId!, review: long, reviewError: null, model: 'gpt-6.1-sol' }
      )
    ).toBe(true);
    expect((await alertRows())[0]?.html).toContain('🧠 Разбор недоступен: разбор не влез в сообщение.');
    expect(await reportRows()).toMatchObject([{ status: 'unreviewed', reviewError: 'AI_TOO_LONG' }]);
  });

  it('closes a report left waiting from a day long gone without sending it', async () => {
    const clock = fakeClock();
    await collectHours(clock, 3, 0);
    const deps = repos();
    await raiseDailyReport({ ...deps, clock, timezone: ZONE, hour: 0 });
    expect(
      await releaseOverdueReports({ reports: deps.reports, alerts: deps.alerts, now: clock.now() + 21 * HOUR })
    ).toBe(0);
    expect(await alertRows()).toEqual([]);
    expect(await reportRows()).toMatchObject([{ status: 'unreviewed', reviewError: 'EXPIRED' }]);
  });

  it('sends the numbers alone when the review does not come within 30 minutes', async () => {
    const clock = fakeClock();
    await collectHours(clock, 3, 0);
    const deps = repos();
    await raiseDailyReport({ ...deps, clock, timezone: ZONE, hour: 0 });
    const at = (minutes: number) => ({
      reports: deps.reports,
      alerts: deps.alerts,
      now: clock.now() + minutes * 60_000
    });
    expect(await releaseOverdueReports(at(29))).toBe(0);
    expect(await releaseOverdueReports(at(31))).toBe(1);
    expect((await alertRows())[0]?.html).toContain('🧠 Разбор недоступен: не успел за 30 минут.');
    expect(await reportRows()).toMatchObject([{ status: 'unreviewed', reviewError: 'REVIEW_TIMEOUT' }]);
  });

  it('scores the forecasts by the readings near their horizon the next day', async () => {
    const clock = fakeClock();
    await collectHours(clock, 26, 0);
    await raiseDailyReport({ ...repos(), clock, timezone: ZONE, hour: 0 });
    await collectHours(clock, 31, 26);
    await raiseDailyReport({ ...repos(), clock, timezone: ZONE, hour: 0 });
    const outcomes = await testDb()
      .prepare('SELECT horizon_hours AS hours, fact FROM content_forecasts WHERE scored_at IS NOT NULL')
      .all<{ hours: number; fact: number | null }>();
    expect(outcomes.results).toHaveLength(3);
    expect(outcomes.results.every((row) => row.hours === 24 && row.fact !== null)).toBe(true);
  });

  it('is sent once: a lost answer leaves it unknown and it is never resent', async () => {
    const clock = fakeClock();
    await collectHours(clock, 3, 0);
    const deps = repos();
    await raiseDailyReport({ ...deps, clock, timezone: ZONE, hour: 0 });
    await releaseOverdueReports({ reports: deps.reports, alerts: deps.alerts, now: clock.now() + HOUR });
    let calls = 0;
    const lost = {
      sendMessageWithKeyboard: async () => {
        calls += 1;
        throw new DOMException('timed out', 'TimeoutError');
      }
    } as unknown as TelegramOwnerMessageApi;
    const send = () =>
      sendContentAlerts({
        repo: deps.alerts,
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

describe('daily report on the Cron tick and the review job', () => {
  async function enable(clock: FakeClock) {
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
  }

  const tickAt = (now: number, tweak?: Parameters<typeof makeTick>[0]['tweak']) =>
    makeTick({ clock: fakeClock(now), scheduledTime: now, transport: fakeTransport(), ...(tweak ? { tweak } : {}) });

  // Regression (review 19.10.2026): the step once needed 49 of the tick's 50 statements and never ran.
  it('stores the day on a minute-2 tick, queues the review, and the job releases it with the review', async () => {
    const clock = fakeClock(Date.UTC(2026, 9, 15, 10, 0));
    await collectHours(clock, 3, 0);
    await enable(clock);
    const sent: unknown[] = [];
    const answer = JSON.stringify(REVIEW);
    const provider: AiTextProvider = {
      provider: 'openai',
      complete: async () => ({
        text: answer,
        model: 'gpt-6.1-sol',
        usage: { inputTokens: 1000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 200 }
      })
    };
    const raise = tickAt(
      Date.UTC(2026, 9, 15, 13, 2),
      (container) =>
        ({
          ...container,
          aiJobs: {
            send: async (job: unknown) => {
              sent.push(job);
            }
          }
        }) as typeof container
    );
    await raise.run();
    expect(tickCount(raise, 'dailyReportRaised')).toBe(1);
    expect(tickCount(raise, 'dailyReviewQueued')).toBe(1);
    expect(raise.container.queryBudget.remaining()).toBeGreaterThanOrEqual(0);
    expect(sent).toMatchObject([{ kind: 'daily_review', reportId: expect.stringMatching(/^daily:/) }]);

    await updateAiSettings(
      { repo: createD1AiRepository(testDb()), clock: fakeClock() },
      {
        revision: 0,
        provider: 'openai',
        enabled: true,
        draftModel: 'gpt-6.1-sol',
        cheapModel: 'gpt-6-luna',
        videoReviews: false,
        prices: [],
        monthlyBudgetUsd: 5,
        dailyCapUsd: 1,
        warnAtPercent: 80
      }
    );
    const job = sent[0] as { reportId: string };
    const consumer = tickAt(
      Date.UTC(2026, 9, 15, 13, 3),
      (container) => ({ ...container, aiProvider: provider }) as typeof container
    );
    await runDailyReview(job.reportId, consumer.container, 't', () => {});
    expect(await reportRows()).toMatchObject([{ status: 'reviewed' }]);

    // The content-alert step runs where sources are configured.
    const sources = youtube(async () => ({ followers: 10, items: [] }));
    const send = tickAt(
      Date.UTC(2026, 9, 15, 13, 8),
      (container) => ({ ...container, contentSources: sources }) as typeof container
    );
    await send.run();
    expect(send.ownerMessages.some((message) => message.html.includes('🧠 Разбор'))).toBe(true);
    expect((await alertRows())[0]?.status).toBe('sent');
  });

  it('releases the numbers alone with the reason when AI is off', async () => {
    const clock = fakeClock(Date.UTC(2026, 9, 15, 10, 0));
    await collectHours(clock, 3, 0);
    await enable(clock);
    const { reportId } = await raiseDailyReport({ ...repos(), clock, timezone: ZONE, hour: 0 });
    const consumer = tickAt(clock.now());
    await runDailyReview(reportId!, consumer.container, 't', () => {});
    const [report] = await reportRows();
    expect(report?.status).toBe('unreviewed');
    expect(report?.reviewError).toMatch(/^AI_/);
    expect((await alertRows())[0]?.html).toContain('🧠 Разбор недоступен');
  });
});
