import type { ContentItemDto } from '@alexeev/contracts';
import { describe, expect, it } from 'vitest';
import { formatSeries } from './formats';

const AT = Date.parse('2026-10-20T08:00:00.000Z');
const DAY = 86_400_000;
let next = 0;

function video(title: string, views: number, platform: ContentItemDto['platform'] = 'youtube', daysAgo = 10) {
  next += 1;
  const published = new Date(AT - daysAgo * DAY).toISOString();
  return {
    id: `${platform}:${next}`,
    platform,
    title,
    url: 'https://example.com/v',
    thumbnailUrl: null,
    publishedAt: published,
    views,
    likes: null,
    comments: null,
    shares: null,
    observedAt: published
  } satisfies ContentItemDto;
}

// The owner's real titles from DEV (20.10.2026): a wrong grouping would tell the owner to repeat the wrong format.
describe('formatSeries', () => {
  it("splits the owner's videos into «Учу фидить» and «Учусь играть», strongest first", () => {
    const items = [
      video('БКБ покупаеют только те, кто не умеет играть в доту. Учу фидить в доту.', 163_100),
      video('Откуда саппорту брать деньги? Учу фидить в доте.', 134_700),
      video('90% керри совершают одну ошибку. Учу фидить в доте.', 1_758),
      video('Как я на оракле играл. Учусь играть в доту. Часть 69…', 2_744),
      video('Как я на сале играл. Учусь играть в доту. Часть 68…', 3_115),
      video('Как я на фениксе играл. Учусь играть в доту. Часть 67…', 3_924),
      video('Я выбил аркану на дровку. И даже на тайда.', 4_244)
    ];
    const series = formatSeries(items, AT);
    expect(series.map((entry) => [entry.key, entry.items.length])).toEqual([
      ['учу фидить', 3],
      ['учусь играть', 3]
    ]);
    expect(series[0]?.label).toBe('Учу фидить в доте');
    expect(series[0]?.best.views).toBe(163_100);
    expect(series[0]!.multiple!).toBeGreaterThan(series[1]!.multiple!);
  });

  it('does not take the closing hashtags for a series (DEV, 20.10.2026)', () => {
    const tags = '#dota #dota2 #дота2 #дота';
    const series = formatSeries(
      [
        video(`Откуда саппорту брать деньги? Учу фидить в доте. ${tags}`, 134_700),
        video(`90% керри совершают одну ошибку. Учу фидить в доте. ${tags}`, 1_758),
        video(`Как я на оракле играл. Учусь играть в доту. Часть 69 ${tags}`, 2_744),
        video(`Как я на сале играл. Учусь играть в доту. Часть 68 ${tags}`, 3_115)
      ],
      AT
    );
    expect(series.map((entry) => entry.key).sort()).toEqual(['учу фидить', 'учусь играть']);
  });

  it('leaves one-offs out and needs two publications for a series', () => {
    const series = formatSeries([video('Один ролик. Совсем один.', 100), video('Другой ролик про героя', 200)], AT);
    expect(series).toEqual([]);
  });

  it('keeps a series of young publications, without a multiple, last', () => {
    const items = [
      video('Топ героев недели', 500, 'telegram', 0),
      video('Топ героев патча', 300, 'telegram', 0),
      video('Вердикт чата: кто прав', 400, 'telegram'),
      video('Вердикт чата: кто виноват', 420, 'telegram'),
      video('Просто пост', 410, 'telegram')
    ];
    const series = formatSeries(items, AT);
    expect(series.map((entry) => [entry.key, entry.multiple === null])).toEqual([
      ['вердикт чата', false],
      ['топ героев', true]
    ]);
  });
});
