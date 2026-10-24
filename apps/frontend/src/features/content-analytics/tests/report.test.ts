import type { ContentItemDto, ContentReportDto } from '@alexeev/contracts';
import { describe, expect, it } from 'vitest';
import { buildInsights } from '../model/insights';
import { median, mediansByPlatform, multipleOf, percentChange, splitPeriods } from '../model/report';

const NOW = Date.parse('2026-10-15T12:00:00Z');
const DAY = 86_400_000;

function item(id: string, platform: 'telegram' | 'youtube', daysAgo: number, views: number): ContentItemDto {
  return {
    id: `${platform}:${id}`,
    platform,
    title: `Пост ${id}`,
    url: 'https://t.me/alexeev_x/1',
    thumbnailUrl: null,
    publishedAt: new Date(NOW - daysAgo * DAY).toISOString(),
    views,
    likes: 1,
    comments: null,
    shares: null,
    observedAt: new Date(NOW).toISOString()
  };
}

function report(items: ContentItemDto[]): ContentReportDto {
  return {
    from: new Date(NOW - 7 * DAY).toISOString(),
    to: new Date(NOW).toISOString(),
    previousFrom: new Date(NOW - 14 * DAY).toISOString(),
    items,
    truncated: false,
    followers: [{ platform: 'telegram', points: [{ day: '2026-10-15', followers: 1000 }] }],
    baselines: [],
    growth: [],
    tracked: []
  };
}

describe('report model', () => {
  it('takes medians per platform from settled items, so a fresh post is never compared with full totals', () => {
    const items = [
      item('1', 'telegram', 3, 100),
      item('2', 'telegram', 4, 300),
      item('3', 'youtube', 5, 50_000),
      item('fresh', 'telegram', 0.3, 10)
    ];
    const medians = mediansByPlatform(items, NOW);
    expect(medians).toMatchObject({ telegram: 200, youtube: 50_000 });
    expect(multipleOf(items[1]!, medians, NOW)).toBe(1.5);
    expect(multipleOf(items[3]!, medians, NOW)).toBeNull();
    expect(median([])).toBeNull();
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(1, 0)).toBeNull();
  });

  it('splits the report into this period and the previous one', () => {
    const split = splitPeriods(report([item('1', 'telegram', 1, 100), item('2', 'telegram', 9, 100)]), undefined);
    expect(split.current.map((entry) => entry.id)).toEqual(['telegram:1']);
    expect(split.previous.map((entry) => entry.id)).toEqual(['telegram:2']);
  });

  it('states the Telegram pace against the plan, and nothing the tiles already show', () => {
    const items = [
      ...[3, 4, 5, 6, 7].map((n) => item(`c${n}`, 'telegram', n, n === 3 ? 900 : 300)),
      ...[10, 11].map((n) => item(`p${n}`, 'telegram', n, 300))
    ];
    const insights = buildInsights({ report: report(items), platform: undefined, days: 7 });
    const byId = new Map(insights.map((insight) => [insight.id, insight]));

    expect([...byId.keys()]).toEqual(['cadence']);
    expect(byId.get('cadence')).toMatchObject({
      tone: 'bad',
      title: 'Telegram: 5 в неделю при плане 14–21',
      badge: { value: '5 из 14', sub: 'в неделю' }
    });
  });
});
