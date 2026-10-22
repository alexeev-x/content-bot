import { describe, expect, it } from 'vitest';
import { type DailyAnalytics, followerCounts, weekViewsOf } from './daily-analytics';
import { compactCount, dailyReportHtml, dailyReviewFacts, growthText, nextMilestone } from './daily-report';
import { fitMessage, visibleLength } from './report-release';

// The report's text (plan §4.2, owner 19.10.2026: a presentation with the AI review): a wrong suffix, a growth
// called a day when it is not, or a review that names the wrong video would mislead the owner.

const ROW = {
  id: 'youtube:a',
  platform: 'youtube' as const,
  title: 'Как я на оракле играл. Учусь играть в доту. Часть 69 #shorts',
  shortTitle: 'Как я на…',
  url: 'https://www.tiktok.com/@alexeev_x/video/769?utm_campaign=tt4d_open_api&utm_source=x',
  format: 'igrat' as const,
  formatSource: 'title' as const,
  publishedAt: 0,
  ageHours: 30,
  observedAt: 1,
  views: 2_700,
  growth: { kind: 'day' as const, views: 173, hours: 24, viewsPerHour: 7 },
  comparison: { ageHours: 24, views: 2_700, median: 1_500, low: 1_000, high: 2_000, items: 6, weak: false },
  status: 'ok' as const,
  forecast: {
    quality: 'insufficient_data' as const,
    method: 'decay-v1',
    origin: 1,
    reason: 'too_few_readings' as const
  }
};

function data(rows: DailyAnalytics['platforms'][number]['rows']) {
  return {
    daily: {
      asOf: Date.UTC(2026, 9, 19, 11, 3),
      partial: false,
      platforms: [{ platform: 'youtube' as const, state: 'ok' as const, lastSuccessAt: 1, errorCode: null, rows }]
    },
    accuracy: { scored: 0, inBand: 0 }
  };
}

describe('daily report text', () => {
  it('shortens counts and names a growth by its real length', () => {
    expect([950, 12_400, 410_000, 1_250_000].map(compactCount)).toEqual(['950', '12.4к', '410к', '1.3м']);
    expect(growthText({ kind: 'day', views: 2400, hours: 24, viewsPerHour: 100 })).toBe('+2.4к за 24ч');
    expect(growthText({ kind: 'window', views: 1200, hours: 20, viewsPerHour: 60 })).toBe('+1.2к за 20ч');
    expect(growthText({ kind: 'anomaly', views: null, hours: 24, viewsPerHour: null, drop: 5 })).toBe(
      'счётчик уменьшился'
    );
    expect(growthText({ kind: 'none', views: null, hours: null, viewsPerHour: null })).toBe('прирост н/д');
  });

  it('gives the model only formatted numbers and a key per video, and says when a comparison is weak', () => {
    const { facts, videos } = dailyReviewFacts(
      data([ROW, { ...ROW, id: 'youtube:b', comparison: { ...ROW.comparison, weak: true } }])
    );
    expect(videos).toEqual(['Y1', 'Y2']);
    expect(facts).toContain('Y1 «Как я на оракле играл» · рубрика «Учусь играть» · возраст 30 ч · всего 2.7к');
    expect(facts).toContain('+80% к обычному, сравнение надёжное');
    expect(facts).toContain('Y2 «Как я на оракле играл»');
    expect(facts).toContain('сравнение слабое');
  });

  it('presents the review with links by key, labelled hypotheses, clean links and the list below', () => {
    const html = dailyReportHtml({
      data: data([ROW]),
      timezone: 'Europe/Moscow',
      review: {
        summary: 'День ровный.',
        rising: [{ video: 'Y1', note: 'выше обычного в ×1.8' }],
        weak: [{ video: 'Y1', note: 'тест', hypotheses: [{ text: 'длинное начало', confidence: 'low' }] }],
        next: 'Начать с косяка.'
      }
    });
    expect(html).toContain('<b>🧠 Разбор</b>\nДень ровный.');
    expect(html).toContain(
      '• <a href="https://www.tiktok.com/@alexeev_x/video/769">Как я на оракле играл</a> (YouTube) — выше'
    );
    expect(html).toContain('<i>Гипотеза (низкая уверенность): длинное начало</i>');
    expect(html).toContain('🎬 <b>Попробовать:</b> Начать с косяка.');
    // Above the usual is an arrow by the growth; the title is cut to keep the row one phone line.
    expect(html).toContain('\n1  2.7к  +173↑ Как я на оракле…</pre>');
    expect(html).toContain('Открыть: <a href="https://www.tiktok.com/@alexeev_x/video/769">1</a>');
    expect(html).not.toContain('utm_');
  });

  it('says why there is no review instead of leaving a gap', () => {
    const html = dailyReportHtml({
      data: data([ROW]),
      timezone: 'Europe/Moscow',
      review: null,
      reviewError: 'AI_DISABLED'
    });
    expect(html).toContain('🧠 Разбор недоступен: ИИ выключен.');
  });
});

describe('a report that does not fit one Telegram message (review 19.10.2026)', () => {
  it('drops whole blocks from the end, never a line of a table, and says where the rest is', () => {
    const table = `<b>YouTube</b>\n<pre>${'1  2.7к  +173  Ролик\n'.repeat(60)}</pre>`;
    const html = [`<b>📈 Аналитика</b>`, table, table, table, table].join('\n\n');
    const fitted = fitMessage(html);
    expect(visibleLength(fitted)).toBeLessThanOrEqual(3900);
    expect(fitted.split('<pre>').length).toBe(fitted.split('</pre>').length);
    expect(fitted).toContain('целиком отчёт в Студии');
    expect(fitMessage('<b>коротко</b>')).toBe('<b>коротко</b>');
  });
});

describe('the numbers of the layout of 22.10.2026', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('gives an older video its week from the reading about 7 days back, scaled to 7 days, else nothing', () => {
    const latest = { views: 339_099, observedAt: 100 * DAY };
    const reading = (daysBack: number, views: number) => ({ itemId: 'x', observedAt: (100 - daysBack) * DAY, views });
    expect(weekViewsOf(latest, [reading(7, 331_676)])).toBe(7423);
    // A reading 8 days back is scaled down to 7 days; none between 3 and 14 days back gives no week.
    expect(weekViewsOf(latest, [reading(8, 330_000)])).toBe(Math.round((9099 * 7) / 8));
    expect(weekViewsOf(latest, [reading(2, 330_000), reading(16, 300_000)])).toBeNull();
    // A counter that went down is no growth.
    expect(weekViewsOf(latest, [reading(7, 400_000)])).toBeNull();
  });

  it('says a milestone only when it is news: by the first digit from 100к, else 10к, 20к, 50к, 100к', () => {
    expect([594_198, 163_220, 9_400, 13_314, 4_000, 2_761].map(nextMilestone)).toEqual([
      600_000,
      200_000,
      10_000,
      20_000,
      null,
      null
    ]);
  });

  it('gives each platform its follower count and the change from the day before only', () => {
    expect(
      followerCounts([
        { platform: 'telegram', day: '2026-10-21', followers: 832 },
        { platform: 'telegram', day: '2026-10-22', followers: 830 },
        { platform: 'tiktok', day: '2026-10-19', followers: 8600 },
        { platform: 'tiktok', day: '2026-10-22', followers: 8675 }
      ])
    ).toEqual([
      { platform: 'telegram', count: 830, change: -2 },
      { platform: 'tiktok', count: 8675, change: null }
    ]);
  });
});
