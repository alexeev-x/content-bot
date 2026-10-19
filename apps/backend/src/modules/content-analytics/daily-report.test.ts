import { describe, expect, it } from 'vitest';
import type { DailyAnalytics } from './daily-analytics';
import { compactCount, dailyReportHtml, growthCell } from './daily-report';

// The report's cells (plan §4.2): a wrong suffix or a growth shown as «+24ч» when it is not would mislead.

const ROW = {
  id: 'youtube:a',
  platform: 'youtube' as const,
  title: 'Феникс 🔥🔥 | Учусь играть в доту',
  shortTitle: 'Феникс 🔥🔥',
  url: 'https://youtube.com/shorts/a?x=1&y=2',
  format: 'igrat' as const,
  formatSource: 'title' as const,
  publishedAt: 0,
  ageHours: 30,
  observedAt: 1,
  views: 12_400,
  comparison: null,
  status: 'ok' as const,
  forecast: {
    quality: 'insufficient_data' as const,
    method: 'decay-v1',
    origin: 1,
    reason: 'too_few_readings' as const
  }
};

function report(rows: DailyAnalytics['platforms'][number]['rows']): string {
  return dailyReportHtml({
    daily: {
      asOf: Date.UTC(2026, 9, 19, 6, 0),
      partial: false,
      platforms: [{ platform: 'youtube', state: 'ok', lastSuccessAt: 1, errorCode: null, rows }]
    },
    timezone: 'Europe/Moscow',
    accuracy: { scored: 0, inBand: 0 }
  });
}

describe('daily report cells', () => {
  it('shortens counts and names a growth by its real length', () => {
    expect([950, 12_400, 410_000, 1_250_000].map(compactCount)).toEqual(['950', '12.4к', '410к', '1.3м']);
    expect(growthCell({ kind: 'day', views: 2400, hours: 24, viewsPerHour: 100 })).toBe('+2.4к');
    expect(growthCell({ kind: 'window', views: 1200, hours: 20, viewsPerHour: 60 })).toBe('+1.2к/20ч');
    expect(growthCell({ kind: 'anomaly', views: null, hours: 24, viewsPerHour: null, drop: 5 })).toBe('сброс');
    expect(growthCell({ kind: 'none', views: null, hours: null, viewsPerHour: null })).toBe('н/д');
  });

  it('keeps emoji out of the table, escapes links, explains other lengths and shows «—» for no views', () => {
    const html = report([
      { ...ROW, growth: { kind: 'window', views: 1200, hours: 20, viewsPerHour: 60 } },
      {
        ...ROW,
        id: 'youtube:b',
        views: null,
        status: 'no_data',
        growth: { kind: 'none', views: null, hours: null, viewsPerHour: null }
      }
    ]);
    const table = /<pre>([\s\S]*)<\/pre>/.exec(html)?.[1] ?? '';
    expect(table).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(table).toContain('+1.2к/20ч');
    expect(table).toMatch(/2 {2}Феникс\s+— +н\/д/);
    expect(html).toContain('href="https://youtube.com/shorts/a?x=1&amp;y=2"');
    expect(html).toContain('«/20ч» — прирост не за сутки');
    expect(html).toContain('Нет свежего замера: 2.');
  });
});
