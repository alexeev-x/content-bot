import { zoned, zonedDate } from './alerts';
import { type DailyAnalytics, type DailyPlatform, readDailyAnalytics } from './daily-analytics';
import { type DailyComparison, type DailyGrowth, shortTitleOf } from './daily-table';
import type { ContentAlertRepository } from './d1-content-alerts-repository';
import type { ContentAnalyticsRepository } from './d1-content-analytics-repository';
import type { ContentDailyReportRepository } from './d1-content-daily-reports-repository';
import type { ContentForecastRepository, ForecastOutcome } from './d1-content-forecasts-repository';
import type { ContentVideoNameRepository } from './d1-content-video-names-repository';
import { factAt } from './forecast-backtest';
import type { Clock } from '../../platform/clock';
import { videoTitleKey } from './title-format';
import type { ItemFormats, VideoFormat } from './types';
import { type Reference, TREND_TEXT, TREND_WORD } from './video-signals';

// The daily analytics report in the owner's private chat (AI plan P6, §4.2–4.3; owner 19.10.2026: a short
// presentation — what works, what does not and why; the details are in the studio). Code computes every number
// (P4 table, P5 forecasts) and stores them first (migration 0077); the AI review only explains them and may be
// missing. The finished message is raised once as content alert `daily:<owner-zone date>:v1`, so the existing
// sender gives it one attempt and leaves an unconfirmed send `unknown`, never resent.

const HOUR_MS = 60 * 60 * 1000;
export const DAILY_REPORT_VERSION = 'v1';
/** The scorer waits until the widest fact tolerance (6 h) has passed, so the closest reading exists. */
const SCORE_AFTER_MS = 6 * HOUR_MS;
const SCORE_LIMIT = 36;
/** A forecast shown needs this many readings behind it (plan §4.2: reliable history). */
const FORECAST_SHOWN_READINGS = 6;
/** Fewer scored forecasts than this is said to be too few to judge. */
const ACCURACY_MIN = 5;
const TITLE_MAX = 48;
/** «↑» from a quarter above the usual, «↓» from a fifth below. */
const ABOVE_USUAL = 1.25;
const BELOW_USUAL = 0.8;
const PLATFORM_NAME = { youtube: 'YouTube', tiktok: 'TikTok' } as const;
const PLATFORM_KEY = { youtube: 'Y', tiktok: 'T' } as const;
const FORMAT_NAME: Record<VideoFormat, string> = {
  fidit: '«Учу фидить»',
  igrat: '«Учусь играть»',
  standalone: 'вне рубрик'
};

/** The stored report: numbers at `asOf` and the forecast accuracy shown with them. */
export interface DailyReportData {
  daily: DailyAnalytics;
  accuracy: { scored: number; inBand: number };
}

/**
 * The AI review as the report shows it (modules/ai `AnalyticsReview`, passed through the app): the main fact,
 * numbered conclusions, a question and next steps (owner, 20.10.2026). Videos are named by their keys in the text.
 */
export interface ReviewV2 {
  main: string;
  points: { text: string; confidence: 'low' | 'medium' }[];
  question: string;
  steps: string[];
  /** A new hypothesis the day's review raised (its numbers checked); absent when it raised none. */
  hypothesis?: { text: string };
}

/** The review's shape before 20.10.2026, still stored with older reports and shown in the studio's history. */
export interface LegacyReview {
  summary: string;
  rising: { video: string; note: string }[];
  weak: { video: string; note: string; hypotheses: { text: string; confidence: 'low' | 'medium' }[] }[];
  next: string;
}

export type DailyReview = ReviewV2 | LegacyReview;

const isLegacy = (review: DailyReview): review is LegacyReview => 'rising' in review;

export const escapeHtml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** 950 → «950», 12 400 → «12.4к», 410 000 → «410к», 1 250 000 → «1.3м». */
export function compactCount(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1000) return String(value);
  if (abs < 100_000) return `${(value / 1000).toFixed(1)}к`;
  if (abs < 1_000_000) return `${Math.round(value / 1000)}к`;
  return `${(value / 1_000_000).toFixed(1)}м`;
}

/** «+12.4к за 24ч», «+1.2к за 20ч», «счётчик уменьшился», «прирост н/д». */
export function growthText(growth: DailyGrowth): string {
  if (growth.kind === 'day' || growth.kind === 'window') return `+${compactCount(growth.views)} за ${growth.hours}ч`;
  return growth.kind === 'anomaly' ? 'счётчик уменьшился' : 'прирост н/д';
}

/** The ratio to the usual at the same age, only for a comparison strong enough to say it. */
export function usualRatio(comparison: DailyComparison | null): number | null {
  if (comparison === null || comparison.weak || comparison.median <= 0) return null;
  return Math.round((comparison.views / comparison.median) * 10) / 10;
}

/** The difference from the usual in per cent, for a comparison strong enough to say it: 80 for ×1.8. */
export function usualPercent(comparison: DailyComparison | null): number | null {
  const ratio = usualRatio(comparison);
  return ratio === null ? null : Math.round((ratio - 1) * 100);
}

function ageText(hours: number): string {
  return hours < 48 ? `${hours} ч` : `${Math.floor(hours / 24)} дн`;
}

/** The link without tracking parameters (TikTok adds a long `utm_*` tail). */
export function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

interface KeyedRow {
  key: string;
  platform: 'youtube' | 'tiktok';
  row: DailyAnalytics['platforms'][number]['rows'][number];
}

function keyedRows(daily: DailyAnalytics): KeyedRow[] {
  return daily.platforms.flatMap((platform) =>
    platform.rows.map((row, index) => ({
      key: `${PLATFORM_KEY[platform.platform]}${index + 1}`,
      platform: platform.platform,
      row
    }))
  );
}

/** The facts the AI review may use, one line per video, every number already formatted as the report shows it. */
export function dailyReviewFacts(data: DailyReportData): {
  facts: string;
  videos: string[];
  /** Each key with its stored item, so the app can add what other modules know (a linked script). */
  items: { key: string; itemId: string }[];
  /** The titles of every video the report shows, so the review can name the ones without a short name. */
  titles: string[];
} {
  const rows = keyedRows(data.daily);
  const lines = data.daily.platforms.flatMap((platform) => {
    const header =
      platform.state === 'ok'
        ? `${PLATFORM_NAME[platform.platform]}:`
        : `${PLATFORM_NAME[platform.platform]}: ${platform.state === 'pending' ? 'данных ещё нет' : 'последний сбор не удался'}`;
    return [
      header,
      ...rows
        .filter((each) => each.platform === platform.platform)
        .map(({ key, row }) => {
          const ratio = usualRatio(row.comparison);
          const comparison =
            row.comparison === null
              ? 'сравнить не с чем'
              : ratio === null
                ? 'сравнение слабое: мало похожих роликов'
                : `обычно для рубрики к ${row.comparison.ageHours}ч: ${compactCount(row.comparison.median)}, у ролика ${compactCount(row.comparison.views)} (${signed(usualPercent(row.comparison) ?? 0)}% к обычному, сравнение надёжное)`;
          return [
            `${key} «${shortTitleOf(row.title, 80)}»`,
            `рубрика ${FORMAT_NAME[row.format]}`,
            `возраст ${ageText(row.ageHours)}`,
            row.trend === undefined ? null : `статус: ${TREND_TEXT[row.trend]}`,
            `всего ${row.views === null ? 'н/д' : compactCount(row.views)}`,
            growthText(row.growth),
            row.growth.viewsPerHour === null ? null : `${row.growth.viewsPerHour}/ч`,
            yesterdayText(row.growth, row.previousGrowth),
            ratesText(row.likesRate ?? null, row.sharesRate ?? null),
            comparison,
            peersText(row)
          ]
            .filter(Boolean)
            .join(' · ');
        })
    ];
  });
  const references = keyedReferences(data.daily);
  if (references.length > 0)
    lines.push(
      '',
      'Ориентиры — самые просматриваемые ролики канала (разный возраст, сравнение слабое):',
      ...references.map(referenceLine)
    );
  if (data.daily.layout === 2) lines.unshift(...generalFactsV2(data.daily), '');
  return {
    facts: lines.join('\n'),
    videos: [...rows.map((row) => row.key), ...references.map((each) => each.key)],
    items: rows.map((row) => ({ key: row.key, itemId: row.row.id })),
    titles: [...rows.map((row) => row.row.title), ...(data.daily.older ?? []).map((video) => video.title)]
  };
}

const plainText = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&');

/** The day's lines about no single video (layout 2): followers, the day's views, the channel, older videos, milestones. */
function generalFactsV2(daily: DailyAnalytics): string[] {
  const telegram = daily.telegram;
  const older = olderLines(daily, undefined);
  const milestones = milestonesOf(daily, undefined, 'UTC');
  return [
    followersLine(daily),
    dayViewsLine(daily),
    telegram === undefined
      ? null
      : telegram.posts.length === 0
        ? 'Telegram: за сутки постов не было'
        : `Telegram за сутки: ${telegram.posts
            .map(
              (post) =>
                `пост «${shortTitleOf(post.title || 'без текста', 60)}» ${post.views === null ? '' : `${compactCount(post.views)} просм.`}`
            )
            .join('; ')}`,
    ...older.map(plainText),
    milestones.length === 0 ? null : `Вехи: ${plainText(milestones.join('; '))}`
  ].filter((line): line is string => line !== null);
}

/** The references with their keys: YR1… for YouTube, TR1… for TikTok. */
function keyedReferences(daily: DailyAnalytics): { key: string; reference: Reference }[] {
  return daily.platforms.flatMap((platform) =>
    (platform.references ?? []).map((reference, index) => ({
      key: `${PLATFORM_KEY[platform.platform]}R${index + 1}`,
      reference
    }))
  );
}

/** «вчера +1.3к, сегодня −49% к вчера» from two real day pairs; null without both. */
function yesterdayText(today: DailyGrowth, before: DailyGrowth | undefined): string | null {
  if (before === undefined || before.kind !== 'day' || today.kind !== 'day') return null;
  const change = before.views > 0 ? Math.round((today.views / before.views - 1) * 100) : null;
  return `вчера +${compactCount(before.views)}${change === null ? '' : ` (сегодня ${signed(change)}% к вчера)`}`;
}

export function ratesText(likes: number | null, shares: number | null): string | null {
  const parts = [likes === null ? null : `лайки ${likes}%`, shares === null ? null : `пересылки ${shares}%`].filter(
    (part) => part !== null
  );
  return parts.length === 0 ? null : parts.join(', ');
}

/** «ровесники рубрики к 24ч: «Сайленсер» 4.7к (у ролика +58%)», from the stored peers; null without them. */
function peersText(row: KeyedRow['row']): string | null {
  const peers = row.peers;
  const own = row.comparison?.views ?? null;
  if (peers === undefined || peers === null || peers.videos.length === 0 || own === null) return null;
  const list = peers.videos.map((peer) => {
    const change = peer.views > 0 ? Math.round((own / peer.views - 1) * 100) : null;
    return `«${shortTitleOf(peer.title, 40)}» ${compactCount(peer.views)}${change === null ? '' : ` (у ролика ${signed(change)}%)`}`;
  });
  return `у ролика к ${peers.ageHours}ч ${compactCount(own)}; ровесники рубрики к ${peers.ageHours}ч: ${list.join(', ')}`;
}

export function referenceLine({ key, reference }: { key: string; reference: Reference }): string {
  return [
    `${key} «${shortTitleOf(reference.title, 80)}»`,
    PLATFORM_NAME[reference.platform],
    `рубрика ${FORMAT_NAME[reference.format]}`,
    `возраст ${reference.ageDays} дн`,
    `всего ${compactCount(reference.views)}`,
    ratesText(reference.likesRate, reference.sharesRate)
  ]
    .filter(Boolean)
    .join(' · ');
}

const signed = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0');

function time(at: number | null, timezone: string): string {
  if (at === null) return '—';
  return new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(
    new Date(at)
  );
}

export const REVIEW_MISSING: Record<string, string> = {
  AI_DISABLED: 'ИИ выключен',
  AI_NO_KEY: 'ключ ИИ не задан',
  AI_BUDGET: 'бюджет ИИ исчерпан',
  REVIEW_TIMEOUT: 'не успел за 30 минут',
  AI_TIMEOUT: 'модель не ответила вовремя',
  AI_NUMBERS_UNVERIFIED: 'в ответе модели были цифры не из отчёта — не показываю',
  AI_BAD_FORMAT: 'модель ответила не в том формате',
  AI_NO_MODEL: 'не выбрана модель ИИ',
  AI_NO_PRICE: 'у модели ИИ нет цены',
  AI_TOO_LONG: 'разбор не влез в сообщение'
};

const CONFIDENCE = { low: 'гипотеза', medium: 'похоже' } as const;
const REVIEW_KEY = /\b(?:YR|TR|Y|T|V|P)\d{1,2}\b/g;

/**
 * The review's conclusions as the message shows them (owner, 20.10.2026): numbered, each with how sure it is, then
 * the editorial question and the next steps. `link` turns a video key of the facts into its title and link.
 */
export function conclusionsBlock(review: ReviewV2, link: (key: string) => string): string[] {
  const text = (value: string) => escapeHtml(value).replace(REVIEW_KEY, (key) => link(key));
  const lines: string[] = [];
  if (review.points.length > 0)
    lines.push(
      '<b>🧠 Выводы</b>',
      ...review.points.map(
        (point, index) => `${index + 1}. ${text(point.text)} <i>(${CONFIDENCE[point.confidence]})</i>`
      )
    );
  if (review.question !== '') lines.push('', `❓ <b>Вопрос:</b> ${text(review.question)}`);
  if (review.steps.length > 0) lines.push('', '🎬 <b>Дальше</b>', ...review.steps.map((step) => `• ${text(step)}`));
  return lines;
}

/** The main fact of the review, one line under the header. */
export function mainLine(review: DailyReview | null, link: (key: string) => string): string | null {
  if (review === null || isLegacy(review) || review.main === '') return null;
  return `<b>Главное:</b> ${escapeHtml(review.main).replace(REVIEW_KEY, (key) => link(key))}`;
}

/** The review as the message shows it; `link` turns a video key of the facts into its title and link. */
export function reviewBlock(review: DailyReview, link: (key: string) => string): string[] {
  return isLegacy(review) ? legacyReviewBlock(review, link) : conclusionsBlock(review, link);
}

function legacyReviewBlock(review: LegacyReview, link: (key: string) => string): string[] {
  const lines = ['<b>🧠 Разбор</b>'];
  if (review.summary !== '') lines.push(escapeHtml(review.summary));
  if (review.rising.length > 0)
    lines.push(
      '',
      '📈 <b>Набирает</b>',
      ...review.rising.map((row) => `• ${link(row.video)} — ${escapeHtml(row.note)}`)
    );
  if (review.weak.length > 0)
    lines.push(
      '',
      '📉 <b>Не заходит</b>',
      ...review.weak.flatMap((row) => [
        `• ${link(row.video)} — ${escapeHtml(row.note)}`,
        ...row.hypotheses.map(
          (hypothesis) =>
            `   <i>Гипотеза (${hypothesis.confidence === 'medium' ? 'средняя' : 'низкая'} уверенность): ${escapeHtml(hypothesis.text)}</i>`
        )
      ])
    );
  if (review.next !== '') lines.push('', `🎬 <b>Попробовать:</b> ${escapeHtml(review.next)}`);
  return lines;
}

/** One row of a platform table: the change column is the day's growth or the difference from the usual. */
export interface TableRow {
  title: string;
  url: string;
  views: number | null;
  change: string;
  /** «↑» well above the usual for the age, «↓» well below, «» otherwise. */
  mark: '↑' | '↓' | '';
  /** The numbers did not update in the last collection. */
  stale: boolean;
  /**
   * The reaction column (owner, 20.10.2026): shares in per cent on TikTok, likes on YouTube (it gives no shares),
   * and the status word. Present, they replace the arrow and shorten the title so the row stays one phone line.
   */
  rate?: string;
  trend?: string;
}

/** Title room in a row: the whole row stays about 32 characters, one phone line (plan §4.2). */
const TABLE_TITLE = 17;
/** With the reaction and status columns the row is about 36 characters. */
const TABLE_TITLE_WIDE = 10;

const fitTitle = (title: string, room = TABLE_TITLE) => {
  const letters = Array.from(shortTitleOf(title, 80));
  return letters.length > room
    ? `${letters
        .slice(0, room - 1)
        .join('')
        .trimEnd()}…`
    : letters.join('');
};

/** 5.07 → «5.07», 12.3 → «12.3»: four characters at most. */
export const rateCell = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : value < 10 ? value.toFixed(2) : value.toFixed(1);

/**
 * A platform's videos as a monospace table (owner, 19.10.2026: the line-per-video list with ▶️/🎵 looked bad;
 * plan §4.2), then the row numbers as links: Telegram has no links inside `<pre>`.
 */
export function platformTable(
  platform: 'youtube' | 'tiktok',
  changeLabel: string,
  rows: readonly TableRow[]
): string[] {
  const wide = rows.some((row) => row.rate !== undefined || row.trend !== undefined);
  const views = (row: TableRow) => `${row.views === null ? '—' : compactCount(row.views)}${row.stale ? '*' : ''}`;
  const line = (number: string, total: string, change: string, mark: string, title: string) =>
    `${number.padEnd(1)} ${total.padStart(5)} ${change.padStart(5)}${mark.padEnd(1)} ${title}`;
  // The weekly table has the reaction column without a status.
  const withTrend = rows.some((row) => row.trend !== undefined);
  const wideLine = (number: string, total: string, change: string, rate: string, trend: string, title: string) =>
    `${number.padEnd(1)} ${total.padStart(5)} ${change.padStart(5)} ${rate.padStart(4)} ${withTrend ? `${trend.padEnd(6)} ` : ''}${title}`;
  const table = wide
    ? [
        wideLine('#', 'Всего', changeLabel, platform === 'tiktok' ? '↗%' : '♥%', 'Статус', 'Ролик'),
        ...rows.map((row, index) =>
          wideLine(
            String(index + 1),
            views(row),
            row.change,
            row.rate ?? '—',
            row.trend ?? '—',
            fitTitle(row.title, TABLE_TITLE_WIDE)
          )
        )
      ]
    : [
        line('#', 'Всего', changeLabel, '', 'Ролик'),
        ...rows.map((row, index) => line(String(index + 1), views(row), row.change, row.mark, fitTitle(row.title)))
      ];
  const lines = [`<b>${PLATFORM_NAME[platform]}</b>`, `<pre>${escapeHtml(table.join('\n'))}</pre>`];
  if (rows.length > 0)
    lines.push(
      `Открыть: ${rows.map((row, index) => `<a href="${escapeHtml(cleanUrl(row.url))}">${index + 1}</a>`).join(' · ')}`
    );
  if (wide) lines.push(`<i>${platform === 'tiktok' ? '↗% — пересылки' : '♥% — лайки'} от просмотров</i>`);
  if (rows.some((row) => row.stale)) lines.push('<i>* цифры не обновились при последнем сборе</i>');
  return lines;
}

export function usualArrow(comparison: DailyComparison | null): '↑' | '↓' | '' {
  const ratio = usualRatio(comparison);
  if (ratio === null) return '';
  return ratio >= ABOVE_USUAL ? '↑' : ratio <= BELOW_USUAL ? '↓' : '';
}

function growthCell(growth: DailyGrowth): string {
  if (growth.kind === 'day') return `+${compactCount(growth.views)}`;
  if (growth.kind === 'window') return `≈+${compactCount(growth.views)}`;
  return growth.kind === 'anomaly' ? 'сброс' : 'н/д';
}

/** One table per platform, newest first (owner, 19.10.2026: «Две таблицы»). */
function videoTables(daily: DailyAnalytics, timezone: string): string[] {
  const lines: string[] = [];
  for (const platform of daily.platforms) {
    if (lines.length > 0) lines.push('');
    if (platform.state === 'pending') {
      lines.push(`<b>${PLATFORM_NAME[platform.platform]}</b>`, 'Данных ещё нет: источник не собирался.');
      continue;
    }
    if (platform.state === 'error')
      lines.push(
        `⚠️ ${PLATFORM_NAME[platform.platform]}: последний сбор не удался — цифры на ${time(platform.lastSuccessAt, timezone)}.`
      );
    const rows = [...platform.rows]
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .map((row) => ({
        title: row.title,
        url: row.url,
        views: row.views,
        change: growthCell(row.growth),
        mark: usualArrow(row.comparison),
        stale: row.status !== 'ok',
        // Reports stored before 20.10.2026 have no status: they keep the old table.
        ...(row.trend === undefined
          ? {}
          : {
              rate: rateCell(platform.platform === 'tiktok' ? row.sharesRate : row.likesRate),
              trend: TREND_WORD[row.trend]
            })
      }));
    if (rows.length === 0) lines.push(`<b>${PLATFORM_NAME[platform.platform]}</b>`, 'Роликов пока нет.');
    else lines.push(...platformTable(platform.platform, '+сут', rows));
  }
  return lines;
}

/** The day's growth of each platform: the sum over its videos; «≈» when some growth is not a 24-hour pair. */
function dayTotals(daily: DailyAnalytics): string | null {
  const parts = daily.platforms.flatMap((platform) => {
    const counted = platform.rows.filter((row) => row.growth.kind === 'day' || row.growth.kind === 'window');
    if (counted.length === 0) return [];
    const total = counted.reduce((sum, row) => sum + (row.growth.views ?? 0), 0);
    const approximate = counted.some((row) => row.growth.kind === 'window');
    return [`${PLATFORM_NAME[platform.platform]} ${approximate ? '≈' : ''}+${compactCount(total)}`];
  });
  return parts.length === 0 ? null : `За сутки: ${parts.join(' · ')}`;
}

/** The forecast of the most watched video with a reliable history, as one line; null when none qualifies. */
function forecastLine(rows: readonly KeyedRow[], timezone: string): string | null {
  const best = rows
    .filter(({ row }) => row.forecast.quality === 'ok' && row.forecast.readings >= FORECAST_SHOWN_READINGS)
    .sort((a, b) => (b.row.views ?? 0) - (a.row.views ?? 0))[0];
  if (best === undefined || best.row.forecast.quality !== 'ok') return null;
  const week = best.row.forecast.horizons.find((point) => point.hours === 168);
  if (week === undefined) return null;
  const day = new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, day: 'numeric', month: 'long' }).format(
    new Date(week.at)
  );
  return `🔮 ${escapeHtml(shortTitleOf(best.row.title, 32))} (${PLATFORM_NAME[best.platform]}): к ${day} — ${compactCount(week.low)}–${compactCount(week.high)} просмотров`;
}

/** Short names by title key (migration 0102); a video without one shows its title cut to the column. */
export type VideoNames = ReadonlyMap<string, string>;

const NAME_WIDTH = 7;
const OLDER_SHOWN = 6;
/** An older platform's line appears once a video of it gained this many views in the week. */
const OLDER_LINE_MIN = 300;
const OLDER_ITEM_MIN = 100;
/**
 * The next count worth saying: from 100к by the first digit (594к → 600к), below it 10к, 20к, 50к, 100к, so a small
 * step («до 9к») is never news. None below 5к.
 */
export function nextMilestone(views: number): number | null {
  if (views >= 100_000) {
    const step = 10 ** Math.floor(Math.log10(views));
    return (Math.floor(views / step) + 1) * step;
  }
  return [10_000, 20_000, 50_000, 100_000].find((value) => value > views && views >= value / 2) ?? null;
}
/** A milestone is said when the day's pace reaches it within this many days. */
const MILESTONE_DAYS = 4;
const MILESTONES_SHOWN = 2;

/** The title keys a report names: its videos, the older ones. */
export function reportTitleKeys(data: DailyReportData): string[] {
  return [
    ...data.daily.platforms.flatMap((platform) => platform.rows.map((row) => videoTitleKey(row.title))),
    ...(data.daily.older ?? []).map((video) => videoTitleKey(video.title))
  ];
}

/** The video's short name: the stored one, else its title cut to the table's column. */
export function videoName(title: string, names: VideoNames | undefined, width = NAME_WIDTH): string {
  const stored = names?.get(videoTitleKey(title));
  const name = stored ?? shortTitleOf(title, width);
  const letters = Array.from(name);
  return letters.length > width ? `${letters.slice(0, width - 1).join('')}…` : name;
}

const PLATFORM_ORDER = ['telegram', 'tiktok', 'youtube'] as const;
const ALL_PLATFORM_NAME = { telegram: 'Telegram', ...PLATFORM_NAME } as const;
const grouped = (value: number) => value.toLocaleString('ru-RU').replace(/\s/g, ' ');

/** «Подписчики: Telegram 830 (−2) · TikTok 8 675 (+5) · YouTube 1 180 (0)». */
function followersLine(daily: DailyAnalytics): string | null {
  const counts = [...(daily.followers ?? [])].sort(
    (a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform)
  );
  if (counts.length === 0) return null;
  return `Подписчики: ${counts
    .map(
      (row) =>
        `${ALL_PLATFORM_NAME[row.platform]} ${grouped(row.count)}${row.change === null ? '' : ` (${signed(row.change)})`}`
    )
    .join(' · ')}`;
}

/** «Просмотры за сутки: TikTok +4.7к · YouTube +78 · Telegram +89»; «≈» when some growth is not a 24-hour pair. */
function dayViewsLine(daily: DailyAnalytics): string | null {
  // TikTok first: it brings most of the day's views.
  const ordered = [...daily.platforms].sort(
    (a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform)
  );
  const parts = ordered.flatMap((platform) => {
    const counted = platform.rows.filter((row) => row.growth.kind === 'day' || row.growth.kind === 'window');
    if (counted.length === 0) return [];
    const total = counted.reduce((sum, row) => sum + (row.growth.views ?? 0), 0);
    const approximate = counted.some((row) => row.growth.kind === 'window');
    return [`${PLATFORM_NAME[platform.platform]} ${approximate ? '≈' : ''}+${compactCount(total)}`];
  });
  const channel = daily.telegram?.dayViews;
  if (channel !== undefined && channel !== null) parts.push(`Telegram +${compactCount(channel)}`);
  return parts.length === 0 ? null : `Просмотры за сутки: ${parts.join(' · ')}`;
}

/** The channel's posts of the day, or that there were none: no post, no views (owner, 22.10.2026). */
function telegramLines(daily: DailyAnalytics): string[] {
  const telegram = daily.telegram;
  if (telegram === undefined) return [];
  if (telegram.posts.length === 0) return ['<b>Telegram:</b> за сутки постов не было.'];
  return [
    '<b>Telegram за сутки</b>',
    ...telegram.posts.map((post) => {
      const title = escapeHtml(shortTitleOf(post.title || 'Пост без текста', TITLE_MAX));
      const numbers = [
        post.views === null ? null : `${compactCount(post.views)} просм.`,
        post.reactions === null ? null : `${post.reactions} реакц.`
      ].filter((part) => part !== null);
      return `• <a href="${escapeHtml(cleanUrl(post.url))}">${title}</a>${numbers.length === 0 ? '' : ` — ${numbers.join(', ')}`}`;
    })
  ];
}

interface VideoGroup {
  key: string;
  title: string;
  publishedAt: number;
  ageHours: number;
  rows: Partial<Record<'youtube' | 'tiktok', DailyPlatform['rows'][number]>>;
}

/** A video's YouTube and TikTok copies as one group, newest first. */
function videoGroups(daily: DailyAnalytics): VideoGroup[] {
  const groups = new Map<string, VideoGroup>();
  for (const platform of daily.platforms)
    for (const row of platform.rows) {
      const key = videoTitleKey(row.title) || row.id;
      const group = groups.get(key) ?? {
        key,
        title: row.title,
        publishedAt: row.publishedAt,
        ageHours: row.ageHours,
        rows: {}
      };
      group.rows[platform.platform] = row;
      group.publishedAt = Math.min(group.publishedAt, row.publishedAt);
      group.ageHours = Math.max(group.ageHours, row.ageHours);
      groups.set(key, group);
    }
  return [...groups.values()].sort((a, b) => b.publishedAt - a.publishedAt);
}

/** One line per video, TikTok and YouTube side by side, about 34 characters: one phone line. */
function videoTableV2(daily: DailyAnalytics, names: VideoNames | undefined): string[] {
  const groups = videoGroups(daily);
  if (groups.length === 0) return ['<b>Ролики за месяц</b>', 'Роликов за месяц нет.'];
  const cell = (row: DailyPlatform['rows'][number] | undefined, width: number) =>
    row === undefined
      ? ['—'.padStart(5), '—'.padStart(width)]
      : [(row.views === null ? '—' : compactCount(row.views)).padStart(5), growthCell(row.growth).padStart(width)];
  const line = (name: string, age: string, cells: string[], stale: boolean) =>
    `${name.padEnd(NAME_WIDTH)} ${age.padStart(3)} ${cells.join(' ')}${stale ? '*' : ''}`;
  const table = [
    `${' '.repeat(NAME_WIDTH + 5)}  TikTok     YouTube`,
    line('Ролик', 'Дн', ['Всего', ' +сут', 'Всего', '+сут'], false),
    ...groups.map((group) =>
      line(
        videoName(group.title, names),
        `${Math.round(group.ageHours / 24)}д`,
        [...cell(group.rows.tiktok, 5), ...cell(group.rows.youtube, 4)],
        Object.values(group.rows).some((row) => row.status !== 'ok')
      )
    )
  ];
  const lines = ['<b>Ролики за месяц</b>', `<pre>${escapeHtml(table.join('\n'))}</pre>`];
  for (const platform of daily.platforms)
    if (platform.state === 'error')
      lines.push(`<i>⚠️ ${PLATFORM_NAME[platform.platform]}: последний сбор не удался.</i>`);
    else if (platform.state === 'pending') lines.push(`<i>${PLATFORM_NAME[platform.platform]}: данных ещё нет.</i>`);
  if (groups.some((group) => Object.values(group.rows).some((row) => row.status !== 'ok')))
    lines.push('<i>* цифры не обновились при последнем сборе</i>');
  return lines;
}

/** «Старше месяца, TikTok за неделю: Варды +7.4к · Драфт +3.1к», one line per platform that moved. */
function olderLines(daily: DailyAnalytics, names: VideoNames | undefined): string[] {
  return (['tiktok', 'youtube'] as const).flatMap((platform) => {
    const moved = (daily.older ?? [])
      .filter((video) => video.platform === platform && (video.weekViews ?? 0) >= OLDER_ITEM_MIN)
      .sort((a, b) => (b.weekViews ?? 0) - (a.weekViews ?? 0));
    if ((moved[0]?.weekViews ?? 0) < OLDER_LINE_MIN) return [];
    return [
      `<b>Старше месяца, ${PLATFORM_NAME[platform]} за неделю:</b> ${moved
        .slice(0, OLDER_SHOWN)
        .map((video) => `${escapeHtml(videoName(video.title, names, 12))} +${compactCount(video.weekViews ?? 0)}`)
        .join(' · ')}`
    ];
  });
}

/** The next round count a video reaches within four days at today's pace. */
export function milestonesOf(daily: DailyAnalytics, names: VideoNames | undefined, timezone: string): string[] {
  const near = daily.platforms.flatMap((platform) =>
    platform.rows.flatMap((row) => {
      if (row.views === null || row.growth.kind !== 'day' || row.growth.views <= 0) return [];
      const views = row.views;
      const next = nextMilestone(views);
      if (next === null) return [];
      const days = (next - views) / row.growth.views;
      if (days > MILESTONE_DAYS) return [];
      return [{ row, platform: platform.platform, next, days }];
    })
  );
  return near
    .sort((a, b) => a.days - b.days || b.next - a.next)
    .slice(0, MILESTONES_SHOWN)
    .map(({ row, platform, next, days }) => {
      const day = new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, day: 'numeric', month: 'long' }).format(
        new Date(daily.asOf + days * 24 * HOUR_MS)
      );
      return `${escapeHtml(videoName(row.title, names, 12))} в ${PLATFORM_NAME[platform]} — ${compactCount(row.views ?? 0)}, до ${compactCount(next)} осталось ${compactCount(next - (row.views ?? 0))} (≈${day})`;
    });
}

/** The day's review: only what is new; nothing new is said as such, not filled with old conclusions. */
function newsBlock(
  review: DailyReview | null,
  reviewError: string | null | undefined,
  link: (key: string) => string
): string[] {
  if (review === null)
    return reviewError
      ? ['<b>🧠 Что нового</b>', `<i>Разбор недоступен: ${REVIEW_MISSING[reviewError] ?? 'ошибка ИИ'}.</i>`]
      : [];
  if (isLegacy(review)) return reviewBlock(review, link);
  const text = (value: string) => escapeHtml(value).replace(REVIEW_KEY, (key) => link(key));
  const points = review.points.map((point) => `• ${text(point.text)}`);
  const hypothesesNamed = review.points.some((point) => /\bH\d{1,4}\b/.test(point.text));
  return [
    '<b>🧠 Что нового</b>',
    ...(points.length === 0 ? ['• За сутки ничего нового.'] : points),
    ...(review.hypothesis !== undefined && review.hypothesis.text !== ''
      ? [`• Новая гипотеза: ${text(review.hypothesis.text)}`]
      : hypothesesNamed
        ? []
        : ['• Гипотезы без изменений.'])
  ];
}

/** The layout of 22.10.2026 (owner): followers and day first, every video of the month, the older ones' week. */
function dailyReportV2(input: {
  data: DailyReportData;
  timezone: string;
  review: DailyReview | null;
  reviewError?: string | null;
  names?: VideoNames;
}): string {
  const { daily } = input.data;
  const day = new Intl.DateTimeFormat('ru-RU', { timeZone: input.timezone, day: 'numeric', month: 'long' }).format(
    new Date(daily.asOf)
  );
  const rows = keyedRows(daily);
  const references = keyedReferences(daily);
  const link = (key: string) => {
    const found = rows.find((row) => row.key === key);
    const reference = references.find((each) => each.key === key)?.reference;
    const target =
      found === undefined ? reference : { url: found.row.url, title: found.row.title, platform: found.platform };
    if (target === undefined) return key;
    return `<a href="${escapeHtml(cleanUrl(target.url))}">${escapeHtml(videoName(target.title, input.names, 12))}</a> (${PLATFORM_NAME[target.platform]})`;
  };
  const lines = [
    `<b>📈 ${day} · ${time(daily.asOf, input.timezone)}</b>${daily.partial ? ' · данные частично' : ''}`,
    ...[followersLine(daily), dayViewsLine(daily)].filter((line): line is string => line !== null)
  ];
  const telegram = telegramLines(daily);
  if (telegram.length > 0) lines.push('', ...telegram);
  lines.push('', ...videoTableV2(daily, input.names));
  const older = olderLines(daily, input.names);
  if (older.length > 0) lines.push(...older);
  const milestones = milestonesOf(daily, input.names, input.timezone);
  if (milestones.length > 0) lines.push('', `🏁 <b>Вехи:</b> ${milestones.join('; ')}`);
  const news = newsBlock(input.review, input.reviewError, link);
  if (news.length > 0) lines.push('', ...news);
  return lines.join('\n');
}

export function dailyReportHtml(input: {
  data: DailyReportData;
  timezone: string;
  /** The AI review, or why there is none; `null` with no reason for «/analytics», which never asks the model. */
  review: DailyReview | null;
  reviewError?: string | null;
  /** Short names of the videos (layout 2); without them a title is cut to the column. */
  names?: VideoNames;
}): string {
  if (input.data.daily.layout === 2) return dailyReportV2(input);
  const { daily, accuracy } = input.data;
  const day = new Intl.DateTimeFormat('ru-RU', { timeZone: input.timezone, day: 'numeric', month: 'long' }).format(
    new Date(daily.asOf)
  );
  const rows = keyedRows(daily);
  const totals = dayTotals(daily);
  const lines = [
    `<b>📈 Аналитика · ${day}, ${time(daily.asOf, input.timezone)}</b>${daily.partial ? ' · данные частично' : ''}`,
    ...(totals === null ? [] : [totals])
  ];
  const references = keyedReferences(daily);
  const link = (key: string) => {
    const found = rows.find((row) => row.key === key);
    const reference = references.find((each) => each.key === key)?.reference;
    const anchor = (url: string, title: string, platform: 'youtube' | 'tiktok') =>
      `<a href="${escapeHtml(cleanUrl(url))}">${escapeHtml(shortTitleOf(title, TITLE_MAX))}</a> (${PLATFORM_NAME[platform]})`;
    if (found !== undefined) return anchor(found.row.url, found.row.title, found.platform);
    return reference === undefined ? key : anchor(reference.url, reference.title, reference.platform);
  };
  const review = input.review;
  if (review !== null && !('rising' in review)) {
    // The layout of 20.10.2026: the main fact, the tables, then the conclusions (owner's example).
    const main = mainLine(review, link);
    if (main !== null) lines.push(main);
    lines.push('', ...videoTables(daily, input.timezone));
    const conclusions = conclusionsBlock(review, link);
    if (conclusions.length > 0) lines.push('', ...conclusions);
  } else {
    if (review !== null) lines.push('', ...reviewBlock(review, link));
    else if (input.reviewError)
      lines.push('', `<i>🧠 Разбор недоступен: ${REVIEW_MISSING[input.reviewError] ?? 'ошибка ИИ'}.</i>`);
    lines.push('', ...videoTables(daily, input.timezone));
  }
  const tail = [
    forecastLine(rows, input.timezone),
    accuracy.scored > 0
      ? `🎯 Прогнозы за сутки: ${accuracy.inBand} из ${accuracy.scored} в диапазоне${accuracy.scored < ACCURACY_MIN ? ' (пока мало, рано судить)' : ''}`
      : null
  ].filter((value): value is string => value !== null);
  if (tail.length > 0) lines.push('', ...tail);
  return lines.join('\n');
}

/** Scores the forecasts whose horizon passed: the reading near it, or `no_fact`; never the current value. */
async function scoreDueForecasts(deps: {
  alerts: Pick<ContentAlertRepository, 'readSnapshots'>;
  forecasts: ContentForecastRepository;
  now: number;
}): Promise<void> {
  const due = await deps.forecasts.listDue(deps.now - SCORE_AFTER_MS, SCORE_LIMIT);
  if (due.length === 0) return;
  const from = Math.min(...due.map((row) => row.targetAt)) - SCORE_AFTER_MS;
  const readings = await deps.alerts.readSnapshots([...new Set(due.map((row) => row.itemId))], from);
  await deps.forecasts.score(
    due.map((row) => {
      const fact = factAt(
        readings.filter((reading) => reading.itemId === row.itemId),
        row.targetAt,
        row.hours
      );
      const outcome: ForecastOutcome =
        fact === null ? 'no_fact' : fact < row.low ? 'below' : fact > row.high ? 'above' : 'in_band';
      return { id: row.id, fact, outcome };
    }),
    deps.now
  );
}

/**
 * Stores today's report once the owner-zone hour is reached: scores due forecasts, builds the table, stores the
 * forecasts it shows and then the report row, the day's claim. Returns the new report's id for its review job;
 * null when the hour is not reached or the report exists.
 */
export async function raiseDailyReport(deps: {
  analytics: ContentAnalyticsRepository;
  alerts: ContentAlertRepository;
  forecasts: ContentForecastRepository;
  reports: ContentDailyReportRepository;
  formats?: ItemFormats;
  clock: Clock;
  timezone: string;
  hour: number;
}): Promise<{ reportId: string | null }> {
  const now = deps.clock.now();
  if (zoned(now, deps.timezone).hour < deps.hour) return { reportId: null };
  const id = `daily:${zonedDate(now, deps.timezone)}:${DAILY_REPORT_VERSION}`;
  if ((await deps.reports.find(id)) !== null) return { reportId: null };
  await scoreDueForecasts({ alerts: deps.alerts, forecasts: deps.forecasts, now });
  const accuracy = await deps.forecasts.accuracy(now - 24 * HOUR_MS);
  const daily = await readDailyAnalytics({
    repo: deps.analytics,
    clock: deps.clock,
    alerts: deps.alerts,
    ...(deps.formats ? { formats: deps.formats } : {})
  });
  // The forecasts first, keyed by the report id: a Worker cut off before the report row leaves them, and the
  // next tick claims the day (a repeat of the forecasts is ignored).
  await deps.forecasts.insert(
    daily.platforms.flatMap((platform) =>
      platform.rows.flatMap((row) =>
        row.forecast.quality !== 'ok'
          ? []
          : row.forecast.horizons.map((point) => ({
              reportId: id,
              itemId: row.id,
              method: row.forecast.method,
              origin: daily.asOf,
              hours: point.hours,
              targetAt: point.at,
              expected: point.expected,
              low: point.low,
              high: point.high
            }))
      )
    ),
    now
  );
  const data: DailyReportData = { daily, accuracy };
  const claimed = await deps.reports.claim({
    id,
    asOf: daily.asOf,
    timezone: deps.timezone,
    data: JSON.stringify(data),
    now
  });
  return { reportId: claimed ? id : null };
}

/** «/analytics» in the bot: the same numbers now, without the review (no model call), stored nowhere. */
export async function dailyReportNow(deps: {
  analytics: ContentAnalyticsRepository;
  forecasts: Pick<ContentForecastRepository, 'accuracy'>;
  alerts?: Pick<ContentAlertRepository, 'readSnapshots' | 'readFollowers'>;
  names?: ContentVideoNameRepository;
  formats?: ItemFormats;
  clock: Clock;
  timezone: string;
}): Promise<string> {
  const now = deps.clock.now();
  const [daily, accuracy] = await Promise.all([
    readDailyAnalytics({
      repo: deps.analytics,
      clock: deps.clock,
      ...(deps.alerts ? { alerts: deps.alerts } : {}),
      ...(deps.formats ? { formats: deps.formats } : {})
    }),
    deps.forecasts.accuracy(now - 24 * HOUR_MS)
  ]);
  const data = { daily, accuracy };
  const names = deps.names === undefined ? undefined : await deps.names.read(reportTitleKeys(data));
  const html = dailyReportHtml({ data, timezone: deps.timezone, review: null, ...(names ? { names } : {}) });
  return `${html}\n\n<i>Разбор ИИ приходит в ежедневном отчёте.</i>`;
}
