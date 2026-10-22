import type { ContentGoalDto } from '@alexeev/contracts';
import type { Clock } from '../../platform/clock';
import { bar, forecastDay, zoned, zonedDate, zonedMidnight } from './alerts';
import {
  compactCount,
  escapeHtml,
  cleanUrl,
  conclusionsBlock,
  rateCell,
  type DailyReview,
  mainLine,
  ratesText,
  referenceLine,
  reviewBlock,
  REVIEW_MISSING,
  platformTable,
  usualArrow,
  usualPercent
} from './daily-report';
import { videoTitleKey } from './title-format';
import { reactionRates, type Reference, referencesOf, REFERENCES_PER_PLATFORM } from './video-signals';
import { comparisonOf, type DailyComparison, shortTitleOf } from './daily-table';
import type { ContentAlertRepository } from './d1-content-alerts-repository';
import type { ContentAnalyticsRepository } from './d1-content-analytics-repository';
import type { ContentDailyReportRepository } from './d1-content-daily-reports-repository';
import { type ContentGoalRepository, readContentGoals } from './goals';
import { BASELINE_WINDOW_MS, baselineFor, FORMAT_BASELINE_MIN_ITEMS, formatIndex } from './service';
import type { ContentPlatform, ItemFormats, VideoFormat } from './types';

// The Monday report of the week that ended (owner 19.10.2026: «то же самое, только в контексте недели»; it
// replaces the old digest). Same base as the daily report: the week's numbers are stored first, the AI review
// explains them and may be missing, the message goes out as content alert `weekly:<Monday>:v1`. Videos are
// compared with the same rubric at the same age, the owner's followers and goals come from one reading, and
// «не заходит» is said only of a video really below its usual (the old digest named the last three anyway).

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const WEEKLY_REPORT_VERSION = 'v1';
/** Monday from this owner-zone hour: the week's last videos have had their first night. */
const WEEKLY_HOUR = 10;
/** Eight videos with the review fit one Telegram message (review 19.10.2026: ten often did not). */
const VIDEOS_MAX = 8;
const POSTS_MAX = 3;
const ITEM_LIMIT = 1000;
const TITLE_MAX = 48;
const PLATFORM_NAME: Record<ContentPlatform, string> = { youtube: 'YouTube', tiktok: 'TikTok', telegram: 'Telegram' };
const FORMAT_NAME: Record<VideoFormat, string> = {
  fidit: '«Учу фидить»',
  igrat: '«Учусь играть»',
  standalone: 'вне рубрик'
};

export interface WeeklyVideoCell {
  platform: 'youtube' | 'tiktok';
  itemId: string;
  url: string;
  views: number | null;
  comparison: DailyComparison | null;
  /** Likes and shares as per cent of views at the week's end (owner, 20.10.2026); absent in older reports. */
  likesRate?: number | null;
  sharesRate?: number | null;
}

export interface WeeklyData {
  kind: 'weekly';
  weekStart: number;
  weekEnd: number;
  published: number;
  publishedBefore: number;
  /** The last reading by the end of Sunday, and its change over the week (null without a base). */
  followers: { platform: ContentPlatform; followers: number; change: number | null }[];
  /** The owner's goals, counted from the same followers as above (the old digest mixed two readings). */
  goals: {
    platform: ContentPlatform;
    target: number;
    followers: number;
    perWeek: number | null;
    forecastDay: string | null;
  }[];
  /** The week's videos, one per title across YouTube and TikTok, newest first. */
  videos: { key: string; title: string; format: VideoFormat; publishedAt: number; cells: WeeklyVideoCell[] }[];
  posts: { key: string; title: string; url: string; views: number | null }[];
  /** The channel's most viewed videos per platform, the review's yardstick; absent in older reports. */
  references?: Reference[];
}

/** The owner-zone Monday 00:00 of this week, once it is Monday from WEEKLY_HOUR; else null. */
export function weeklyReportWeekEnd(now: number, timezone: string): number | null {
  const parts = zoned(now, timezone);
  if (parts.weekday !== 0 || parts.hour < WEEKLY_HOUR) return null;
  return zonedMidnight(now, timezone);
}

export async function readWeeklyData(deps: {
  analytics: ContentAnalyticsRepository;
  alerts: Pick<ContentAlertRepository, 'readRecent' | 'readCheckpoints' | 'readFollowers'>;
  goals: ContentGoalRepository;
  formats?: ItemFormats;
  clock: Clock;
  timezone: string;
  weekEnd: number;
}): Promise<WeeklyData> {
  const { weekEnd, timezone } = deps;
  // Noon a week back is always inside the previous Monday, whatever a DST change did to the week.
  const weekStart = zonedMidnight(weekEnd - 7 * DAY_MS + 12 * HOUR_MS, timezone);
  const previousStart = zonedMidnight(weekStart - 7 * DAY_MS + 12 * HOUR_MS, timezone);
  const [recent, checkpoints, followers, goals, formatOf, top] = await Promise.all([
    deps.alerts.readRecent({ itemsFrom: previousStart, limit: ITEM_LIMIT }),
    deps.analytics.readCheckpoints({ publishedFrom: weekEnd - BASELINE_WINDOW_MS }),
    deps.alerts.readFollowers(new Date(previousStart).toISOString().slice(0, 10)),
    readContentGoals({ repo: deps.goals, clock: deps.clock }),
    formatIndex({ repo: deps.analytics, ...(deps.formats ? { formats: deps.formats } : {}) }),
    deps.analytics.topVideos(REFERENCES_PER_PLATFORM)
  ]);
  const week = recent.items.filter((item) => item.publishedAt >= weekStart && item.publishedAt < weekEnd);
  const before = recent.items.filter((item) => item.publishedAt >= previousStart && item.publishedAt < weekStart);
  // Daily follower counts are stored per UTC day: the last reading by the end of each Sunday.
  const endDay = new Date(weekEnd - 1).toISOString().slice(0, 10);
  const startDay = new Date(weekStart - 1).toISOString().slice(0, 10);
  const followerRows = (['youtube', 'tiktok', 'telegram'] as const).flatMap((platform) => {
    const own = followers.filter((point) => point.platform === platform);
    const last = own.filter((point) => point.day <= endDay).at(-1);
    const base = own.filter((point) => point.day <= startDay).at(-1);
    // No reading during the week (a source down all week): no count for the end of Sunday, never a fake «0».
    if (last === undefined || last.day <= startDay) return [];
    return [
      { platform, followers: last.followers, change: base === undefined ? null : last.followers - base.followers }
    ];
  });
  // The pace too comes from the week's own reading (review 19.10.2026): the change over the week, and the day the
  // target is reached at it.
  const goalRows = goals.goals.flatMap((goal: ContentGoalDto) => {
    const reading = followerRows.find((row) => row.platform === goal.platform);
    if (reading === undefined) return [];
    const perWeek = reading.change;
    const left = goal.target - reading.followers;
    const forecast =
      perWeek === null || perWeek <= 0 || left <= 0
        ? null
        : new Date(weekEnd + Math.ceil(left / perWeek) * 7 * DAY_MS).toISOString().slice(0, 10);
    return [
      { platform: goal.platform, target: goal.target, followers: reading.followers, perWeek, forecastDay: forecast }
    ];
  });
  const formatById = new Map(checkpoints.map((row) => [row.id, formatOf(row).format]));
  const videos = new Map<string, WeeklyData['videos'][number]>();
  for (const item of week
    .filter((each) => each.platform !== 'telegram')
    .sort((a, b) => b.publishedAt - a.publishedAt)) {
    const platform = item.platform as 'youtube' | 'tiktok';
    const { format } = formatOf(item);
    const ids = new Set(
      checkpoints.filter((row) => row.platform === platform && formatById.get(row.id) === format).map((row) => row.id)
    );
    const byFormat = baselineFor(checkpoints, platform, item.id, { ids, minItems: FORMAT_BASELINE_MIN_ITEMS });
    const baseline = byFormat.points.length > 0 ? { ...byFormat, format } : baselineFor(checkpoints, platform, item.id);
    const own = checkpoints.find((row) => row.id === item.id)?.views ?? {};
    // A title of hashtags alone has no words to match its copy by: it stays its own video.
    const key = videoTitleKey(item.title) || item.id;
    const video = videos.get(key) ?? { key: '', title: item.title, format, publishedAt: item.publishedAt, cells: [] };
    const rates = reactionRates(item);
    video.cells.push({
      platform,
      itemId: item.id,
      url: item.url,
      views: item.views,
      comparison: comparisonOf({ checkpoints: own, baseline }),
      likesRate: rates.likes,
      sharesRate: rates.shares
    });
    videos.set(key, video);
  }
  const videoList = [...videos.values()]
    .slice(0, VIDEOS_MAX)
    // YouTube first in every line, as in the daily report, whichever platform published first.
    .map((video, index) => ({
      ...video,
      key: `V${index + 1}`,
      cells: [...video.cells].sort((a, b) => (a.platform === b.platform ? 0 : a.platform === 'youtube' ? -1 : 1))
    }));
  const posts = week
    .filter((item) => item.platform === 'telegram')
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, POSTS_MAX)
    .map((item, index) => ({ key: `P${index + 1}`, title: item.title, url: item.url, views: item.views }));
  return {
    kind: 'weekly',
    weekStart,
    weekEnd,
    published: week.length,
    publishedBefore: before.length,
    followers: followerRows,
    goals: goalRows,
    videos: videoList,
    posts,
    references: referencesOf(top, (item) => formatById.get(item.id) ?? formatOf(item).format, weekEnd)
  };
}

const PLATFORM_KEY = { youtube: 'Y', tiktok: 'T' } as const;

/** The references with their keys: YR1… for YouTube, TR1… for TikTok, as in the daily report. */
function keyedReferences(data: WeeklyData): { key: string; reference: Reference }[] {
  const count = { youtube: 0, tiktok: 0 };
  return (data.references ?? []).map((reference) => {
    count[reference.platform] += 1;
    return { key: `${PLATFORM_KEY[reference.platform]}R${count[reference.platform]}`, reference };
  });
}

const signedCount = (value: number) =>
  value > 0 ? `+${compactCount(value)}` : value < 0 ? `−${compactCount(-value)}` : '0';
const exact = new Intl.NumberFormat('ru-RU');

function range(data: WeeklyData, timezone: string): string {
  const format = (at: number) =>
    new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, day: 'numeric', month: 'long' }).format(new Date(at));
  return `${format(data.weekStart)} — ${format(data.weekEnd - 1)}`;
}

/**
 * Each rubric's week: the median difference from the usual over its videos with a strong comparison, and how many
 * that is; a rubric with none is left out rather than guessed (owner: «какие рубрики заходят»).
 */
export function rubricWeek(data: WeeklyData): { format: VideoFormat; percent: number; cells: number }[] {
  return (['igrat', 'fidit', 'standalone'] as const).flatMap((format) => {
    const percents = data.videos
      .filter((video) => video.format === format)
      .flatMap((video) => video.cells.map((cell) => usualPercent(cell.comparison)))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    if (percents.length === 0) return [];
    const middle = Math.floor(percents.length / 2);
    const median =
      percents.length % 2 === 1 ? percents[middle]! : Math.round((percents[middle - 1]! + percents[middle]!) / 2);
    return [{ format, percent: median, cells: percents.length }];
  });
}

const signedPercent = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}%`;

/** The facts the weekly review may use: the week's totals, each video's numbers by key, the posts. */
export function weeklyReviewFacts(
  data: WeeklyData,
  timezone: string
): { facts: string; videos: string[]; items: { key: string; itemId: string }[] } {
  const lines = [
    `Неделя ${range(data, timezone)}: публикаций ${data.published} (неделей раньше ${data.publishedBefore}).`,
    ...data.followers.map(
      (row) =>
        `Подписчики ${PLATFORM_NAME[row.platform]}: ${exact.format(row.followers)}${row.change === null ? '' : ` (${signedCount(row.change)} за неделю)`}`
    ),
    ...rubricWeek(data).map(
      (row) =>
        `Рубрика ${FORMAT_NAME[row.format]} за неделю: ${signedPercent(row.percent)} к обычному (медиана, роликов на платформах: ${row.cells})`
    ),
    ...data.videos.map((video) =>
      [
        `${video.key} «${shortTitleOf(video.title, 80)}» · рубрика ${FORMAT_NAME[video.format]}`,
        ...video.cells.map((cell) => {
          const percent = usualPercent(cell.comparison);
          const compared =
            cell.comparison === null
              ? 'сравнить не с чем'
              : percent === null
                ? 'сравнение слабое: мало похожих роликов'
                : `к ${cell.comparison.ageHours}ч ${compactCount(cell.comparison.views)}, обычно ${compactCount(cell.comparison.median)} (${percent > 0 ? '+' : percent < 0 ? '−' : ''}${Math.abs(percent)}% к обычному, сравнение надёжное)`;
          const rates = ratesText(cell.likesRate ?? null, cell.sharesRate ?? null);
          return `${PLATFORM_NAME[cell.platform]} всего ${cell.views === null ? 'н/д' : compactCount(cell.views)}${rates === null ? '' : `, ${rates}`}, ${compared}`;
        })
      ].join(' · ')
    ),
    ...data.posts.map(
      (post) =>
        `${post.key} пост «${shortTitleOf(post.title, 80)}» · ${post.views === null ? 'н/д' : compactCount(post.views)} просмотров`
    )
  ];
  const references = keyedReferences(data);
  if (references.length > 0)
    lines.push(
      '',
      'Ориентиры — самые просматриваемые ролики канала (разный возраст, сравнение слабое):',
      ...references.map(referenceLine)
    );
  return {
    facts: lines.join('\n'),
    videos: [
      ...data.videos.map((video) => video.key),
      ...data.posts.map((post) => post.key),
      ...references.map((each) => each.key)
    ],
    items: data.videos.map((video) => ({ key: video.key, itemId: video.cells[0]?.itemId ?? '' }))
  };
}

export function weeklyReportHtml(input: {
  data: WeeklyData;
  timezone: string;
  review: DailyReview | null;
  reviewError?: string | null;
}): string {
  const { data, timezone } = input;
  const lines = [
    `<b>📈 Итоги недели · ${range(data, timezone)}</b>`,
    data.published === 0
      ? 'За неделю публикаций не было.'
      : `Публикаций: ${data.published} (неделей раньше ${data.publishedBefore})`
  ];
  if (data.followers.length > 0)
    lines.push(
      `Подписчики: ${data.followers
        .map(
          (row) =>
            `${PLATFORM_NAME[row.platform]} ${exact.format(row.followers)}${row.change === null ? '' : ` (${signedCount(row.change)})`}`
        )
        .join(' · ')}`
    );
  for (const goal of data.goals) {
    const share = goal.followers / goal.target;
    const pace =
      goal.followers >= goal.target
        ? 'достигнута 🎉'
        : [
            goal.perWeek === null ? null : `${signedCount(goal.perWeek)} в неделю`,
            goal.forecastDay === null
              ? goal.perWeek !== null && goal.perWeek <= 0
                ? 'рост стоит'
                : null
              : `→ к ${forecastDay(goal.forecastDay, timezone)}`
          ]
            .filter(Boolean)
            .join(' ');
    lines.push(
      `🎯 ${PLATFORM_NAME[goal.platform]}: ${exact.format(goal.followers)} из ${exact.format(goal.target)} <code>${bar(share)}</code> ${Math.min(100, Math.floor(share * 100))}%${pace === '' ? '' : ` · ${pace}`}`
    );
  }
  const references = keyedReferences(data);
  const link = (key: string) => {
    const video = data.videos.find((each) => each.key === key);
    if (video !== undefined)
      return `<a href="${escapeHtml(cleanUrl(video.cells[0]?.url ?? ''))}">${escapeHtml(shortTitleOf(video.title, TITLE_MAX))}</a>`;
    const post = data.posts.find((each) => each.key === key);
    if (post !== undefined)
      return `<a href="${escapeHtml(cleanUrl(post.url))}">${escapeHtml(shortTitleOf(post.title, TITLE_MAX))}</a> (Telegram)`;
    const reference = references.find((each) => each.key === key)?.reference;
    return reference === undefined
      ? key
      : `<a href="${escapeHtml(cleanUrl(reference.url))}">${escapeHtml(shortTitleOf(reference.title, TITLE_MAX))}</a> (${PLATFORM_NAME[reference.platform]})`;
  };
  const review = input.review;
  // The layout of 20.10.2026 puts the conclusions after the tables; an older stored review keeps its place.
  const current = review !== null && !('rising' in review) ? review : null;
  if (current !== null) {
    const main = mainLine(current, link);
    if (main !== null) lines.push('', main);
  } else if (review !== null) lines.push('', ...reviewBlock(review, link));
  else if (input.reviewError)
    lines.push('', `<i>🧠 Разбор недоступен: ${REVIEW_MISSING[input.reviewError] ?? 'ошибка ИИ'}.</i>`);
  const rubrics = rubricWeek(data);
  if (rubrics.length > 0)
    lines.push(
      '',
      `<b>🏷 Рубрики</b> · ${rubrics.map((row) => `${FORMAT_NAME[row.format]} ${signedPercent(row.percent)}`).join(' · ')}`
    );
  if (data.videos.length > 0) {
    lines.push('', '<i>Ролики недели; «обыч.» — к обычному для рубрики того же возраста.</i>');
    // One table per platform, as in the daily report (owner, 19.10.2026: «Две таблицы»).
    for (const platform of ['youtube', 'tiktok'] as const) {
      const rows = data.videos.flatMap((video) =>
        video.cells
          .filter((cell) => cell.platform === platform)
          .map((cell) => {
            const percent = usualPercent(cell.comparison);
            return {
              title: video.title,
              url: cell.url,
              views: cell.views,
              change: percent === null ? '—' : signedPercent(percent),
              mark: usualArrow(cell.comparison),
              stale: false,
              ...(cell.likesRate === undefined
                ? {}
                : { rate: rateCell(platform === 'tiktok' ? cell.sharesRate : cell.likesRate) })
            };
          })
      );
      if (rows.length > 0) lines.push('', ...platformTable(platform, 'обыч.', rows));
    }
  }
  if (data.posts.length > 0) {
    lines.push('', '<b>Telegram</b> · посты недели');
    data.posts.forEach((post, index) =>
      lines.push(
        `${index + 1}. <a href="${escapeHtml(cleanUrl(post.url))}">${escapeHtml(shortTitleOf(post.title, TITLE_MAX))}</a> · ${post.views === null ? '—' : compactCount(post.views)}`
      )
    );
  }
  if (current !== null) {
    const conclusions = conclusionsBlock(current, link);
    if (conclusions.length > 0) lines.push('', ...conclusions);
  }
  return lines.join('\n');
}

/** Stores the week once from Monday's hour; returns its report id for the review job, else null. */
export async function raiseWeeklyReport(deps: {
  analytics: ContentAnalyticsRepository;
  alerts: Pick<ContentAlertRepository, 'readRecent' | 'readCheckpoints' | 'readFollowers' | 'existing'>;
  goals: ContentGoalRepository;
  reports: ContentDailyReportRepository;
  formats?: ItemFormats;
  clock: Clock;
  timezone: string;
}): Promise<{ reportId: string | null; attempted: boolean }> {
  const now = deps.clock.now();
  const weekEnd = weeklyReportWeekEnd(now, deps.timezone);
  if (weekEnd === null) return { reportId: null, attempted: false };
  const day = zonedDate(weekEnd, deps.timezone);
  const id = `weekly:${day}:${WEEKLY_REPORT_VERSION}`;
  if ((await deps.reports.find(id)) !== null) return { reportId: null, attempted: false };
  // The deploy Monday: the old digest of this week may be out already; one weekly message is enough.
  if ((await deps.alerts.existing([`digest:${day}`])).size > 0) return { reportId: null, attempted: false };
  const data = await readWeeklyData({ ...deps, weekEnd });
  const claimed = await deps.reports.claim({ id, asOf: now, timezone: deps.timezone, data: JSON.stringify(data), now });
  // An attempt costs the tick its statements, whether or not this run won the claim.
  return { reportId: claimed ? id : null, attempted: true };
}
