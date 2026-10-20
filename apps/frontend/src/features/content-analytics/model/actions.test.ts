import type { ContentItemDto, ContentReportDto } from '@alexeev/contracts';
import { describe, expect, it } from 'vitest';
import { buildActions, composeCards } from './actions';
import type { Insight } from './insights';
import { formatSeries } from './formats';

const TO = Date.parse('2026-10-20T08:00:00.000Z');
const DAY = 86_400_000;
let next = 0;

function item(platform: ContentItemDto['platform'], title: string, views: number, daysAgo: number): ContentItemDto {
  next += 1;
  const published = new Date(TO - daysAgo * DAY).toISOString();
  return {
    id: `${platform}:${next}`,
    platform,
    title,
    url: 'https://example.com/i',
    thumbnailUrl: null,
    publishedAt: published,
    views,
    likes: null,
    comments: null,
    shares: null,
    observedAt: published
  };
}

function report(items: ContentItemDto[], telegram: [number, number]): ContentReportDto {
  return {
    from: new Date(TO - 30 * DAY).toISOString(),
    to: new Date(TO).toISOString(),
    previousFrom: new Date(TO - 60 * DAY).toISOString(),
    items,
    truncated: false,
    followers: [
      {
        platform: 'telegram',
        points: [
          { day: '2026-09-19', followers: telegram[0] },
          { day: '2026-10-20', followers: telegram[1] }
        ]
      }
    ],
    baselines: [],
    growth: [],
    tracked: []
  };
}

// The owner's DEV picture of 20.10.2026: videos with 1.8M views, Telegram −3, no video for five days, «Учу фидить»
// far above «Учусь играть». Missing any of these tells the owner the wrong thing to do next.
describe('buildActions', () => {
  const items = [
    item('youtube', 'БКБ покупают только те, кто не умеет. Учу фидить в доту.', 163_100, 15),
    item('tiktok', 'Откуда саппорту брать деньги? Учу фидить в доте.', 591_400, 20),
    item('youtube', 'Как я на оракле играл. Учусь играть в доту. Часть 69', 2_744, 5),
    item('youtube', 'Как я на сале играл. Учусь играть в доту. Часть 68', 3_115, 11),
    item('tiktok', 'Как я на фениксе играл. Учусь играть в доту. Часть 67', 8_334, 19),
    item('telegram', 'Что думаете, выиграем?', 216, 2)
  ];

  it('puts the broken funnel and the winning format first; five days is no pause at a video every four', () => {
    const built = report(items, [834, 831]);
    const actions = buildActions({
      report: built,
      platform: undefined,
      days: 30,
      series: formatSeries(built.items, TO)
    });
    expect(actions.map((action) => action.id)).toEqual(['funnel', 'format-gap']);
    expect(actions[0]?.action?.kind).toBe('invite');
    expect(actions[1]?.title).toMatch(/^«Учу фидить в доту?» в \d+ раз(а)? сильнее «Учусь играть в доту»$/);
  });

  it('says nothing about the funnel while Telegram grows', () => {
    const built = report(items, [700, 831]);
    const ids = buildActions({ report: built, platform: undefined, days: 30, series: [] }).map((action) => action.id);
    expect(ids).not.toContain('funnel');
  });

  it('leaves the funnel out on the YouTube view and the video pause out on the Telegram view', () => {
    const built = report(items, [834, 831]);
    expect(buildActions({ report: built, platform: 'youtube', days: 30, series: [] }).map((a) => a.id)).toEqual([
      'video-gap'
    ]);
    expect(buildActions({ report: built, platform: 'telegram', days: 30, series: [] }).map((a) => a.id)).toEqual([
      'funnel'
    ]);
  });

  it('flags a pause past one and a half of the usual interval, saying what is usual', () => {
    const steady = [2, 4, 6, 8, 10].map((daysAgo) => item('youtube', 'Ролик', 1000, daysAgo + 2));
    const built = report(steady, [834, 834]);
    const [pause] = buildActions({ report: built, platform: 'youtube', days: 30, series: [] });
    expect(pause).toMatchObject({ id: 'video-gap', title: 'Роликов не было 4 дня' });
    expect(pause?.detail).toMatch(/^Обычно вы выкладываете ролик раз в 2 дня./);
    const onTime = report(
      [2, 4, 6, 8, 10].map((daysAgo) => item('youtube', 'Ролик', 1000, daysAgo)),
      [834, 834]
    );
    expect(buildActions({ report: onTime, platform: 'youtube', days: 30, series: [] })).toEqual([]);
  });
});

describe('composeCards', () => {
  const card = (id: string, title = id): Insight => ({ id, tone: 'neutral', title, detail: 'Деталь.' });

  it('folds the turn in the latest videos into the format card and keeps four cards at most', () => {
    const cards = composeCards(
      [card('funnel'), card('video-gap'), card('format-gap')],
      [card('recent-tiktok', 'Последние 5 в TikTok: −40% к обычному'), card('cadence'), card('extra')]
    );
    expect(cards.map((entry) => entry.id)).toEqual(['funnel', 'video-gap', 'format-gap', 'cadence']);
    expect(cards[2]?.detail).toBe('Последние 5 в TikTok: −40% к обычному. Деталь.');
  });

  it('keeps the turn as its own card when no format wins', () => {
    expect(composeCards([card('funnel')], [card('recent-tiktok'), card('cadence')]).map((entry) => entry.id)).toEqual([
      'funnel',
      'recent-tiktok',
      'cadence'
    ]);
  });
});
