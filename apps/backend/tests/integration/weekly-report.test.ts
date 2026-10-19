import { beforeEach, describe, expect, it } from 'vitest';
import {
  createD1ContentAlertRepository,
  createD1ContentAnalyticsRepository,
  createD1ContentDailyReportRepository,
  createD1ContentGoalRepository,
  raiseWeeklyReport,
  releaseDailyReport,
  setContentGoal
} from '../../src/modules/content-analytics';
import { testDb } from '../helpers/db';
import { fakeClock, resetDb } from '../helpers/harness';

// The Monday report (owner 19.10.2026: the daily report «в контексте недели», replacing the digest): stored once,
// followers and goals from one reading (the digest showed 832 subscribers and «831 из 1 000»), and released
// through the same review path as the daily report.

const ZONE = 'Europe/Moscow';
// Monday 19.10.2026, 10:30 in Moscow: the week of 12–18 October has ended.
const MONDAY = Date.parse('2026-10-19T07:30:00Z');

async function seedItem(id: string, platform: string, title: string, publishedAt: number, views: number) {
  await testDb()
    .prepare(
      `INSERT INTO content_items (id, platform, title, url, published_at, views, observed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, platform, title, `https://example.com/${id}?utm_source=x`, publishedAt, views, MONDAY)
    .run();
}

async function seedFollowers(platform: string, day: string, followers: number) {
  await testDb()
    .prepare('INSERT INTO content_audience_days (platform, day, followers, observed_at) VALUES (?, ?, ?, ?)')
    .bind(platform, day, followers, MONDAY)
    .run();
}

const repos = () => ({
  analytics: createD1ContentAnalyticsRepository(testDb()),
  alerts: createD1ContentAlertRepository(testDb()),
  goals: createD1ContentGoalRepository(testDb()),
  reports: createD1ContentDailyReportRepository(testDb())
});

beforeEach(resetDb);

describe('weekly report', () => {
  it('is stored once on Monday from 10:00 and counts goals from the same reading as the followers', async () => {
    await seedItem(
      'youtube:o',
      'youtube',
      'Как я на оракле играл. Учусь играть в доту',
      Date.parse('2026-10-15T12:00:00Z'),
      4200
    );
    await seedItem(
      'tiktok:o',
      'tiktok',
      'Как я на оракле играл. Учусь играть в доту',
      Date.parse('2026-10-15T13:00:00Z'),
      12600
    );
    await seedItem(
      'telegram:1',
      'telegram',
      'Открыл обучение, ничего не понял',
      Date.parse('2026-10-16T10:00:00Z'),
      366
    );
    await seedFollowers('telegram', '2026-10-11', 820);
    await seedFollowers('telegram', '2026-10-18', 831);
    // Monday's own reading: the old digest's goal took it while the followers line took Sunday's.
    await seedFollowers('telegram', '2026-10-19', 832);
    await setContentGoal(
      { repo: createD1ContentGoalRepository(testDb()), clock: fakeClock(MONDAY) },
      { platform: 'telegram', target: 1000 }
    );

    const early = { ...repos(), clock: fakeClock(Date.parse('2026-10-19T06:30:00Z')), timezone: ZONE };
    expect(await raiseWeeklyReport(early)).toEqual({ reportId: null, attempted: false });
    const deps = { ...repos(), clock: fakeClock(MONDAY), timezone: ZONE };
    const both = await Promise.all([raiseWeeklyReport(deps), raiseWeeklyReport(deps)]);
    const ids = both.map((result) => result.reportId).filter((id) => id !== null);
    expect(ids).toEqual(['weekly:2026-10-19:v1']);

    expect(
      await releaseDailyReport(
        { reports: deps.reports, alerts: deps.alerts, now: MONDAY },
        {
          id: ids[0]!,
          review: { summary: 'Неделя ровная.', rising: [{ video: 'V1', note: 'держится' }], weak: [], next: '' },
          reviewError: null,
          model: 'gpt-6.1-sol'
        }
      )
    ).toBe(true);
    const alert = await testDb()
      .prepare('SELECT title, html FROM content_alerts WHERE id = ?')
      .bind(ids[0])
      .first<{ title: string; html: string }>();
    expect(alert?.title).toBe('Итоги недели');
    expect(alert?.html).toContain('<b>📊 Итоги недели · 12 октября — 18 октября</b>');
    expect(alert?.html).toContain('Подписчики: ✈️ 831 (+11)');
    expect(alert?.html).toMatch(/🎯 Telegram: 831 из 1\s000/u);
    expect(alert?.html).toContain('<b>🧠 Разбор</b>\nНеделя ровная.');
    // One line per video across both platforms, clean links.
    expect(alert?.html).toMatch(
      /1\. Как я на оракле играл\n {4}<a href="https:\/\/example\.com\/youtube:o">▶️<\/a> 4\.2к {2}· {2}<a href="https:\/\/example\.com\/tiktok:o">🎵<\/a> 12\.6к/
    );
    expect(alert?.html).toContain(
      '<b>✈️ Посты недели</b>\n1. <a href="https://example.com/telegram:1">Открыл обучение, ничего не понял</a> · 366'
    );
    expect(alert?.html).not.toContain('utm_');
  });
});

describe('weekly report followers', () => {
  it('leaves out a platform without a reading during the week instead of a stale count with «0»', async () => {
    await seedFollowers('tiktok', '2026-10-04', 8000);
    await seedFollowers('telegram', '2026-10-11', 820);
    await seedFollowers('telegram', '2026-10-18', 831);
    const deps = { ...repos(), clock: fakeClock(MONDAY), timezone: ZONE };
    const { reportId } = await raiseWeeklyReport(deps);
    await releaseDailyReport(
      { reports: deps.reports, alerts: deps.alerts, now: MONDAY },
      { id: reportId!, review: null, reviewError: 'AI_DISABLED', model: null }
    );
    const alert = await testDb()
      .prepare('SELECT html FROM content_alerts WHERE id = ?')
      .bind(reportId)
      .first<{ html: string }>();
    expect(alert?.html).toContain('Подписчики: ✈️ 831 (+11)');
    expect(alert?.html).not.toContain('🎵');
  });
});
