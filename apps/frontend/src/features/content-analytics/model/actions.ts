import type { ContentPlatform, ContentReportDto } from '@alexeev/contracts';
import { pluralRu } from '../../../shared/lib/ru-format';
import { formatCount, itemTitle } from './format';
import type { FormatSeries } from './formats';
import type { Insight } from './insights';
import { followersStats, splitPeriods } from './report';

// «Что сделать» (owner, 20.10.2026: «аналитика ради аналитики»): the few conclusions that change what the owner does
// next, ahead of the rule-based observations. The goal is the Telegram channel fed by the Reels traffic
// (docs/PLAN.md), so a broken funnel, a pause in videos and a format that clearly wins come first.

const DAY_MS = 86_400_000;
/** Video views in the period below this are too few to blame the funnel. */
const FUNNEL_MIN_VIEWS = 20_000;
/** Telegram growth under this share of the channel per period counts as «no growth». */
const FUNNEL_FLAT_SHARE = 0.01;
/** A pause in videos from this many days is worth saying. */
const VIDEO_GAP_DAYS = 3;
/** A format «wins» at this many times the usual; it is set against another one at least this many times weaker. */
const FORMAT_STRONG = 1.5;
const FORMAT_GAP = 3;

const VIDEO_PLATFORMS: readonly ContentPlatform[] = ['youtube', 'tiktok'];

function timesWord(multiple: number): string {
  const rounded = Math.round(multiple);
  return `в ${rounded} ${pluralRu(rounded, 'раз', 'раза', 'раз')}`;
}

export function buildActions(input: {
  report: ContentReportDto;
  platform: ContentPlatform | undefined;
  days: number;
  series: readonly FormatSeries[];
}): Insight[] {
  const { report, platform, days, series } = input;
  const actions: Insight[] = [];
  const at = Date.parse(report.to);
  const { current } = splitPeriods(report, undefined);

  // 1. The videos bring views, the channel does not grow: the whole plan rests on this funnel.
  if (platform === undefined || platform === 'telegram') {
    const telegram = followersStats(report, 'telegram');
    const videoViews = current
      .filter((item) => VIDEO_PLATFORMS.includes(item.platform))
      .reduce((sum, item) => sum + (item.views ?? 0), 0);
    if (
      telegram.now !== null &&
      telegram.change !== null &&
      videoViews >= FUNNEL_MIN_VIEWS &&
      telegram.change < telegram.now * FUNNEL_FLAT_SHARE
    ) {
      const change = `${telegram.change > 0 ? '+' : telegram.change < 0 ? '−' : ''}${formatCount(Math.abs(telegram.change))}`;
      actions.push({
        id: 'funnel',
        tone: 'bad',
        title: 'Ролики не приводят людей в Telegram',
        detail: `За ${days} дней ролики набрали ${formatCount(videoViews)} просмотров, а в канале ${change} ${pluralRu(Math.abs(telegram.change), 'подписчик', 'подписчика', 'подписчиков')}. Поставьте пригласительную ссылку в шапку TikTok и описание YouTube — так будет видно, что приводит людей.`,
        badge: { value: change, sub: 'в Telegram' },
        action: { kind: 'invite', label: 'Создать ссылку' }
      });
    }
  }

  // 2. A pause in videos: they bring the traffic, and the platforms rank a regular channel higher.
  if (platform === undefined || VIDEO_PLATFORMS.includes(platform)) {
    const videos = report.items.filter(
      (item) => VIDEO_PLATFORMS.includes(item.platform) && (platform === undefined || item.platform === platform)
    );
    const latest = [...videos].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];
    if (latest !== undefined) {
      const gap = Math.floor((at - Date.parse(latest.publishedAt)) / DAY_MS);
      if (gap >= VIDEO_GAP_DAYS) {
        actions.push({
          id: 'video-gap',
          tone: 'bad',
          title: `Роликов не было ${gap} ${pluralRu(gap, 'день', 'дня', 'дней')}`,
          detail: `Последний — «${itemTitle(latest)}». Ролики приводят основной трафик; без новых падает и охват канала.`,
          itemId: latest.id,
          badge: { value: String(gap), sub: pluralRu(gap, 'день', 'дня', 'дней') },
          thumb: latest.thumbnailUrl
        });
      }
    }
  }

  // 3. One format clearly beats another: repeat the winner.
  const scored = series.filter((entry) => entry.multiple !== null);
  const strong = scored[0];
  const weak = [...scored].reverse().find((entry) => entry !== strong);
  if (strong !== undefined && strong.multiple! >= FORMAT_STRONG) {
    const versus =
      weak !== undefined && weak.multiple! > 0 && strong.multiple! / weak.multiple! >= FORMAT_GAP
        ? { weak, ratio: strong.multiple! / weak.multiple! }
        : null;
    actions.push({
      id: 'format-gap',
      tone: 'good',
      title: versus
        ? `«${strong.label}» ${timesWord(versus.ratio)} сильнее «${versus.weak.label}»`
        : `«${strong.label}» заходит лучше всего`,
      detail: versus
        ? `Медиана ${strong.multiple!.toLocaleString('ru-RU')}× к обычному против ${versus.weak.multiple!.toLocaleString('ru-RU')}× (${strong.items.length} и ${versus.weak.items.length} публ.). Снимайте больше «${strong.label}».`
        : `Медиана ${strong.multiple!.toLocaleString('ru-RU')}× к обычному на ${strong.items.length} публ. Повторите формат.`,
      itemId: strong.best.id,
      badge: { value: `${strong.multiple!.toLocaleString('ru-RU')}×`, sub: 'к обычному' },
      thumb: strong.best.thumbnailUrl
    });
  }
  return actions;
}
