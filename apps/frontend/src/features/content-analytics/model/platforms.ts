import type { ContentPlatform, ContentReportDto } from '@alexeev/contracts';
import { followersStats, percentChange, periodStats, settledItems, splitPeriods } from './report';

// One tile per platform instead of figures summed across them (owner, 20.10.2026: «10,7 тыс. подписчиков» added
// Telegram, YouTube and TikTok together and hid that Telegram was falling).

export type PlatformSummary = {
  platform: ContentPlatform;
  followers: number | null;
  followersChange: number | null;
  followersPoints: { day: string; followers: number }[];
  items: number;
  /** Publications a week over the period, one decimal. */
  perWeek: number;
  views: number;
  viewsChange: number | null;
  /** Median views of a settled publication. */
  median: number | null;
  /** Reactions or likes, comments and shares per 100 views (from «Сравнение платформ», removed 20.10.2026). */
  engagement: number | null;
  /** Telegram only: the median post's views per follower, percent. */
  reach: number | null;
  reachChange: number | null;
};

export function platformSummary(report: ContentReportDto, platform: ContentPlatform, days: number): PlatformSummary {
  const at = Date.parse(report.to);
  const { current, previous } = splitPeriods(report, platform);
  const now = periodStats(current);
  const before = periodStats(previous);
  const settledNow = periodStats(settledItems(current, at));
  const followers = followersStats(report, platform);
  const reachOf = (median: number | null) =>
    platform !== 'telegram' || median === null || !followers.now ? null : Math.round((median / followers.now) * 100);
  const reach = reachOf(settledNow.medianViews);
  return {
    platform,
    followers: followers.now,
    followersChange: followers.change,
    followersPoints: followers.points,
    items: now.items,
    perWeek: Math.round((now.items / days) * 7 * 10) / 10,
    views: now.views,
    viewsChange: before.items > 0 ? percentChange(now.views, before.views) : null,
    median: settledNow.medianViews,
    engagement: now.engagement,
    reach,
    reachChange: percentChange(reach, reachOf(before.medianViews))
  };
}

/** A platform with nothing to show (not connected, nothing collected) gets no tile. */
export const hasData = (summary: PlatformSummary) => summary.followers !== null || summary.items > 0;
