import type { ContentPlatform, ContentReportDto } from '@alexeev/contracts';
import { pluralRu } from '../../../shared/lib/ru-format';
import { formatCount, PLATFORM_LABEL } from './format';
import { isSettled, median, percentChange, PLATFORMS, splitPeriods } from './report';

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

function signed(percent: number): string {
  return percent > 0 ? `+${percent}%` : percent < 0 ? `−${-percent}%` : '0%';
}

/** At least this many items in the period before a pattern counts as one. */
const MIN_ITEMS = 4;
/** The plan's Telegram pace: 2–3 posts a day (docs/PLAN.md, stage 0). */
const TG_PLAN_PER_WEEK = [14, 21] as const;

// The rule-based cards beside the actions (owner, 20.10.2026: «нам нужны все эти блоки?»): only the latest
// publications turning against the usual, and the Telegram pace against the plan. Each states its numbers.
export function buildInsights(input: {
  report: ContentReportDto;
  platform: ContentPlatform | undefined;
  days: number;
}): Insight[] {
  const { report, platform, days } = input;
  const { current, previous } = splitPeriods(report, platform);
  const insights: Insight[] = [];
  const at = Date.parse(report.to);

  // The latest publications against the period: is the trend turning?
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

  // Cadence: publishing less is the most common reason for fewer views. The plan sets a pace for
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
      // «9,6 из 14»: the pace against the plan's floor, not a bare number.
      badge: { value: `${perWeekText} из ${low}`, sub: 'в неделю' }
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
