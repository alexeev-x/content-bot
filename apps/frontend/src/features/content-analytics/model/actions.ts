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
/** A pause in videos counts from this many days, and only past PAUSE_FACTOR of the owner's usual interval. */
const VIDEO_GAP_DAYS = 3;
const PAUSE_FACTOR = 1.5;
/** Intervals between the latest videos that set «usual». */
const USUAL_INTERVALS = 10;
/** «Что сделать» shows at most this many cards (owner, 20.10.2026: four that matter, no «Показать ещё»). */
export const CARDS_MAX = 4;
/** A format «wins» at this many times the usual; it is set against another one at least this many times weaker. */
const FORMAT_STRONG = 1.5;
const FORMAT_GAP = 3;

const VIDEO_PLATFORMS: readonly ContentPlatform[] = ['youtube', 'tiktok'];

function timesWord(multiple: number): string {
  const rounded = Math.round(multiple);
  return `в ${rounded} ${pluralRu(rounded, 'раз', 'раза', 'раз')}`;
}

/** Median days between the latest videos, newest first; null with fewer than three intervals. */
function usualIntervalDays(newestFirst: readonly { publishedAt: string }[]): number | null {
  const times = newestFirst.slice(0, USUAL_INTERVALS + 1).map((item) => Date.parse(item.publishedAt));
  const intervals = times.slice(1).map((time, index) => ((times[index] ?? time) - time) / DAY_MS);
  if (intervals.length < 3) return null;
  const sorted = [...intervals].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** «день», «2 дня». */
function usualText(days: number): string {
  const rounded = Math.max(1, Math.round(days));
  return rounded === 1 ? 'день' : `${rounded} ${pluralRu(rounded, 'день', 'дня', 'дней')}`;
}

/**
 * The cards of «Что сделать», at most CARDS_MAX: the actions, then the rule-based cards. A turn in the latest videos
 * joins the format card when there is one (owner, 20.10.2026: the TikTok drop and the format winner told one story
 * in two cards), so that card says both what changed and what to film.
 */
export function composeCards(actions: readonly Insight[], insights: readonly Insight[]): Insight[] {
  const format = actions.find((card) => card.id === 'format-gap');
  const turns = insights.filter((card) => card.id.startsWith('recent-'));
  const cards = actions.map((card) =>
    card === format && turns.length > 0
      ? { ...card, detail: `${turns.map((turn) => `${turn.title}.`).join(' ')} ${card.detail}` }
      : card
  );
  const rest = format === undefined ? insights : insights.filter((card) => !turns.includes(card));
  return [...cards, ...rest].slice(0, CARDS_MAX);
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
    const sorted = [...videos].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    const latest = sorted[0];
    if (latest !== undefined) {
      const gap = Math.floor((at - Date.parse(latest.publishedAt)) / DAY_MS);
      // A pause counts against the owner's own rhythm: three days is nothing for a weekly channel.
      const usual = usualIntervalDays(sorted);
      if (gap >= VIDEO_GAP_DAYS && (usual === null || gap > usual * PAUSE_FACTOR)) {
        actions.push({
          id: 'video-gap',
          tone: 'bad',
          title: `Роликов не было ${gap} ${pluralRu(gap, 'день', 'дня', 'дней')}`,
          detail: `${usual === null ? '' : `Обычно вы выкладываете ролик раз в ${usualText(usual)}. `}Последний — «${itemTitle(latest)}». Ролики приводят основной трафик; без новых падает и охват канала.`,
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
