import type { ContentItemDto, ContentPlatform, ContentReportDto } from '@alexeev/contracts';
import { pluralRu } from '../../../shared/lib/ru-format';
import { formatCount, itemTitle, PLATFORM_LABEL } from './format';
import {
  bestBlock,
  followersStats,
  HOUR_BLOCKS,
  isSettled,
  median,
  mediansByPlatform,
  multipleOf,
  percentChange,
  periodStats,
  PLATFORMS,
  splitPeriods
} from './report';

export type InsightTone = 'good' | 'bad' | 'neutral';
export type Insight = {
  id: string;
  tone: InsightTone;
  title: string;
  detail: string;
  itemId?: string;
  /** The number the conclusion rests on, shown at the right of its card. */
  badge?: { value: string; sub?: string };
  /** A cover when the conclusion is about one publication. */
  thumb?: string | null;
};

/** «в 3,1 раза» */
function times(multiple: number): string {
  // A fraction always takes «раза»: «в 1,2 раза», but «в 5 раз».
  const word = Number.isInteger(multiple) ? pluralRu(multiple, 'раз', 'раза', 'раз') : 'раза';
  return `в ${multiple.toLocaleString('ru-RU')} ${word}`;
}

function signed(percent: number): string {
  return percent > 0 ? `+${percent}%` : percent < 0 ? `−${-percent}%` : '0%';
}

export function blockLabel(block: number): string {
  const start = HOUR_BLOCKS[block] ?? 0;
  return `${String(start).padStart(2, '0')}:00–${String(start + 4).padStart(2, '0')}:00`;
}

// Telegram reach norms for personal channels in the niche (docs/PLAN.md, 157 Dota channels, 14.10.2026).
const REACH_GOOD = 30;
const REACH_LOW = 20;
/** At least this many items in the period before a pattern counts as one. */
const MIN_ITEMS = 4;
/** The plan's Telegram pace: 2–3 posts a day (docs/PLAN.md, stage 0). */
const TG_PLAN_PER_WEEK = [14, 21] as const;

// Rule-based conclusions, strongest first. Each one states its numbers, so the owner can check it.
export function buildInsights(input: {
  report: ContentReportDto;
  platform: ContentPlatform | undefined;
  days: number;
  timezone: string;
}): Insight[] {
  const { report, platform, days, timezone } = input;
  const { current, previous } = splitPeriods(report, platform);
  const insights: Insight[] = [];
  const now = periodStats(current);
  const before = periodStats(previous);
  const at = Date.parse(report.to);
  const medians = mediansByPlatform(current, at);

  // 1. The period against the previous one.
  if (now.items > 0 && before.items > 0) {
    const change = percentChange(now.views, before.views);
    if (change !== null) {
      insights.push({
        id: 'views-change',
        tone: change >= 10 ? 'good' : change <= -10 ? 'bad' : 'neutral',
        title:
          Math.abs(change) < 10
            ? `Просмотры на уровне прошлых ${days} дней (${signed(change)})`
            : `Просмотры ${signed(change)} к прошлым ${days} дням`,
        detail: `${formatCount(now.views)} против ${formatCount(before.views)}: ${now.items} ${pluralRu(now.items, 'публикация', 'публикации', 'публикаций')} против ${before.items}. Новые публикации ещё добирают просмотры.`,
        badge: { value: formatCount(now.views), sub: signed(change) }
      });
    }
  } else if (now.items > 0 && before.items === 0) {
    insights.push({
      id: 'views-no-base',
      tone: 'neutral',
      title: `${formatCount(now.views)} просмотров за ${days} дней`,
      detail: 'За прошлый период публикаций нет: сравнить пока не с чем.'
    });
  }

  // 2. The leader against what is usual for its platform.
  const ranked = current
    .map((item) => ({ item, multiple: multipleOf(item, medians, at) }))
    .filter((entry): entry is { item: ContentItemDto; multiple: number } => entry.multiple !== null)
    .sort((a, b) => b.multiple - a.multiple);
  const leader = ranked[0];
  if (leader !== undefined && leader.multiple >= 1.5 && ranked.length >= MIN_ITEMS) {
    insights.push({
      id: 'leader',
      tone: 'good',
      title: `«${itemTitle(leader.item)}» ${times(leader.multiple)} выше обычного`,
      detail: `${formatCount(leader.item.views)} просмотров при медиане ${formatCount(medians[leader.item.platform] ?? null)} в ${PLATFORM_LABEL[leader.item.platform]}. Повторите тему или формат первой строки.`,
      itemId: leader.item.id,
      thumb: leader.item.thumbnailUrl,
      badge: { value: formatCount(leader.item.views), sub: `${leader.multiple.toLocaleString('ru-RU')}×` }
    });
  }

  // 3. Hits and misses: how often a publication clears 1.5× the median, how often it falls under half.
  if (ranked.length >= MIN_ITEMS) {
    const hits = ranked.filter((entry) => entry.multiple >= 1.5).length;
    const misses = ranked.filter((entry) => entry.multiple <= 0.5).length;
    insights.push({
      id: 'hit-rate',
      tone: hits >= misses ? 'neutral' : 'bad',
      title: `${hits} из ${ranked.length} ${pluralRu(ranked.length, 'публикации', 'публикаций', 'публикаций')} выстрелили, ${misses} провалились`,
      detail: 'Выстрелила: от 1,5× медианы своей платформы. Провалилась: меньше половины медианы.',
      badge: { value: `${hits} / ${ranked.length}`, sub: `${misses} провалов` }
    });
  }

  // 4. The latest publications against the period: is the trend turning?
  for (const each of PLATFORMS) {
    if (platform !== undefined && platform !== each) continue;
    const ofPlatform = current
      .filter((item) => item.platform === each && item.views !== null)
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    // The newest items are still collecting views; they would always look weak.
    const settled = ofPlatform.filter((item) => isSettled(item, at));
    if (settled.length < MIN_ITEMS * 2) continue;
    const recent = median(settled.slice(0, 5).map((item) => item.views ?? 0));
    const usual = median(settled.map((item) => item.views ?? 0));
    const change = percentChange(recent, usual);
    if (change === null || Math.abs(change) < 20) continue;
    insights.push({
      id: `recent-${each}`,
      tone: change > 0 ? 'good' : 'bad',
      title: `Последние 5 в ${PLATFORM_LABEL[each]}: ${signed(change)} к обычному`,
      detail: `Медиана последних пяти (старше трёх суток) ${formatCount(recent)} против ${formatCount(usual)} за период.`,
      badge: { value: formatCount(recent), sub: signed(change) }
    });
  }

  // 5. Telegram reach: what share of subscribers sees a post.
  if (platform === undefined || platform === 'telegram') {
    const followers = followersStats(report, 'telegram').now;
    const postsMedian = medians.telegram ?? null;
    if (followers !== null && followers > 0 && postsMedian !== null) {
      const reach = Math.round((postsMedian / followers) * 100);
      insights.push({
        id: 'tg-reach',
        tone: reach >= REACH_GOOD ? 'good' : reach < REACH_LOW ? 'bad' : 'neutral',
        title: `Пост в Telegram видят ${reach}% подписчиков`,
        detail: `Медиана ${formatCount(postsMedian)} просмотров при ${formatCount(followers)} подписчиках. У личных каналов о Dota обычно 20–50%, у новостных 4–15%.`,
        badge: {
          value: `${reach}%`,
          sub: reach >= REACH_GOOD ? 'выше нормы' : reach < REACH_LOW ? 'ниже нормы' : 'в норме'
        }
      });
    }
  }

  // 6. Best time to post, per platform.
  for (const each of PLATFORMS) {
    if (platform !== undefined && platform !== each) continue;
    const ofPlatform = current.filter((item) => item.platform === each);
    const best = bestBlock(ofPlatform, timezone);
    if (best === null || best.multiple < 1.2) continue;
    insights.push({
      id: `best-time-${each}`,
      tone: 'neutral',
      title: `${PLATFORM_LABEL[each]}: лучше всего заходит ${blockLabel(best.block)}`,
      detail: `Медиана ${formatCount(best.medianViews)}, ${times(best.multiple)} выше обычного (${best.items} ${pluralRu(best.items, 'публикация', 'публикации', 'публикаций')}).`,
      badge: { value: `${best.multiple.toLocaleString('ru-RU')}×`, sub: blockLabel(best.block) }
    });
  }

  // 7. Followers over the period.
  for (const each of PLATFORMS) {
    if (platform !== undefined && platform !== each) continue;
    const stats = followersStats(report, each);
    if (stats.change === null || stats.now === null) continue;
    const base = stats.now - stats.change;
    const percent = base > 0 ? Math.round((stats.change / base) * 1000) / 10 : null;
    insights.push({
      id: `followers-${each}`,
      tone: stats.change > 0 ? 'good' : stats.change < 0 ? 'bad' : 'neutral',
      title: `${PLATFORM_LABEL[each]}: ${stats.change > 0 ? '+' : stats.change < 0 ? '−' : ''}${formatCount(Math.abs(stats.change))} ${pluralRu(Math.abs(stats.change), 'подписчик', 'подписчика', 'подписчиков')}`,
      detail: `Сейчас ${formatCount(stats.now)}${percent === null ? '' : `, ${percent > 0 ? '+' : ''}${percent.toLocaleString('ru-RU')}% за период`}.`,
      badge: {
        value: `${stats.change > 0 ? '+' : stats.change < 0 ? '−' : ''}${formatCount(Math.abs(stats.change))}`,
        ...(percent === null ? {} : { sub: `${percent > 0 ? '+' : ''}${percent.toLocaleString('ru-RU')}%` })
      }
    });
  }

  // 8. Reach beyond the audience: views per follower, the platform that brings strangers.
  if (platform === undefined) {
    const perFollower = PLATFORMS.map((each) => {
      const followers = followersStats(report, each).now;
      const views = periodStats(current.filter((item) => item.platform === each)).views;
      return { each, value: followers !== null && followers > 0 && views > 0 ? views / followers : null };
    }).filter((entry): entry is { each: ContentPlatform; value: number } => entry.value !== null);
    const sorted = [...perFollower].sort((a, b) => b.value - a.value);
    const top = sorted[0];
    const low = sorted.at(-1);
    if (top && low && top.each !== low.each && top.value / low.value >= 1.2) {
      const ratio = Math.round((top.value / low.value) * 10) / 10;
      insights.push({
        id: 'per-follower',
        tone: 'neutral',
        title: `${PLATFORM_LABEL[top.each]} даёт ${times(ratio)} больше просмотров на подписчика, чем ${PLATFORM_LABEL[low.each]}`,
        detail: `Там ролики уходят далеко за пределы своей аудитории: ведите оттуда в Telegram ссылкой в описании и вопросом в конце ролика.`,
        badge: { value: `×${ratio.toLocaleString('ru-RU')}`, sub: `к ${PLATFORM_LABEL[low.each]}` }
      });
    }
  }

  // 9. Cadence: publishing less is the most common reason for fewer views. The plan sets a pace for
  // Telegram only, so Telegram (also with every platform shown) is checked against it; a video platform
  // against its previous period.
  const cadenceOf = platform ?? 'telegram';
  const posted = current.filter((item) => item.platform === cadenceOf).length;
  const postedBefore = previous.filter((item) => item.platform === cadenceOf).length;
  const perWeek = Math.round((posted / days) * 7 * 10) / 10;
  const perWeekText = perWeek.toLocaleString('ru-RU');
  const cadenceChange = percentChange(posted, postedBefore);
  if (cadenceOf === 'telegram' && posted > 0) {
    const [low, high] = TG_PLAN_PER_WEEK;
    insights.push({
      id: 'cadence',
      tone: perWeek < low ? 'bad' : 'good',
      title:
        perWeek < low
          ? `Telegram: ${perWeekText} в неделю при плане ${low}–${high}`
          : perWeek > high
            ? `Telegram: ${perWeekText} в неделю, чаще плана ${low}–${high}`
            : `Telegram: ${perWeekText} в неделю, как в плане`,
      detail: `${posted} ${pluralRu(posted, 'пост', 'поста', 'постов')} за ${days} дней против ${postedBefore} за прошлые. В плане 2–3 поста в день.`,
      badge: { value: perWeekText, sub: cadenceChange === null ? 'в неделю' : signed(cadenceChange) }
    });
  } else if (cadenceOf !== 'telegram' && posted > 0 && postedBefore > 0) {
    if (cadenceChange !== null && Math.abs(cadenceChange) >= 25) {
      insights.push({
        id: 'cadence',
        tone: cadenceChange > 0 ? 'good' : 'bad',
        title:
          cadenceChange > 0
            ? `Публикуете чаще: ${posted} против ${postedBefore}`
            : `Публикуете реже: ${posted} против ${postedBefore}`,
        detail: `${perWeekText} в неделю в ${PLATFORM_LABEL[cadenceOf]}.`,
        badge: { value: perWeekText, sub: signed(cadenceChange) }
      });
    }
  }

  return insights;
}
