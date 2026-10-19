import { zoned, zonedDate } from './alerts';
import { type DailyAnalytics, readDailyAnalytics } from './daily-analytics';
import { type DailyComparison, type DailyGrowth, shortTitleOf } from './daily-table';
import type { ContentAlertRepository } from './d1-content-alerts-repository';
import type { ContentAnalyticsRepository } from './d1-content-analytics-repository';
import type { ContentDailyReportRepository } from './d1-content-daily-reports-repository';
import type { ContentForecastRepository, ForecastOutcome } from './d1-content-forecasts-repository';
import { factAt } from './forecast-backtest';
import type { Clock } from '../../platform/clock';
import type { ItemFormats, VideoFormat } from './types';

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
/** «↑ +80%» from a quarter above the usual, «↓ −40%» from a fifth below; between is «≈ обычно». */
const ABOVE_USUAL = 1.25;
const BELOW_USUAL = 0.8;
const PLATFORM_NAME = { youtube: 'YouTube', tiktok: 'TikTok' } as const;
const PLATFORM_ICON = { youtube: '▶️', tiktok: '🎵' } as const;
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

/** The AI review as the report shows it (modules/ai `AnalyticsReview`, passed through the app). */
export interface DailyReview {
  summary: string;
  rising: { video: string; note: string }[];
  weak: { video: string; note: string; hypotheses: { text: string; confidence: 'low' | 'medium' }[] }[];
  next: string;
}

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

export function usualMark(comparison: DailyComparison | null): string | null {
  const ratio = usualRatio(comparison);
  const percent = usualPercent(comparison);
  if (ratio === null || percent === null) return null;
  if (ratio >= ABOVE_USUAL) return `↑ +${percent}%`;
  return ratio <= BELOW_USUAL ? `↓ −${Math.abs(percent)}%` : '≈ обычно';
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
            `всего ${row.views === null ? 'н/д' : compactCount(row.views)}`,
            growthText(row.growth),
            row.growth.viewsPerHour === null ? null : `${row.growth.viewsPerHour}/ч`,
            comparison
          ]
            .filter(Boolean)
            .join(' · ');
        })
    ];
  });
  return {
    facts: lines.join('\n'),
    videos: rows.map((row) => row.key),
    items: rows.map((row) => ({ key: row.key, itemId: row.row.id }))
  };
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

/** The review as the message shows it; `link` turns a video key of the facts into its title and link. */
export function reviewBlock(review: DailyReview, link: (key: string) => string): string[] {
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

/** A platform's cell in a video's line: its icon as the link, views, the day's growth and the usual. */
function platformCell(platform: 'youtube' | 'tiktok', row: KeyedRow['row']): string {
  const growth =
    row.growth.kind === 'day'
      ? `+${compactCount(row.growth.views)}`
      : row.growth.kind === 'window'
        ? `+${compactCount(row.growth.views)}/${row.growth.hours}ч`
        : row.growth.kind === 'anomaly'
          ? 'сброс'
          : 'н/д';
  return [
    `<a href="${escapeHtml(cleanUrl(row.url))}">${PLATFORM_ICON[platform]}</a> ${row.views === null ? '—' : compactCount(row.views)}`,
    growth,
    usualMark(row.comparison),
    row.status === 'ok' ? null : '⏳'
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * One line per video, newest first: the owner posts the same video on both platforms, so a title read once
 * carries both platforms' numbers (owner, 19.10.2026: the same list twice was noise).
 */
function videoLines(daily: DailyAnalytics, timezone: string): string[] {
  const lines = ['<b>📋 Ролики</b> · прирост за сутки'];
  for (const platform of daily.platforms) {
    if (platform.state === 'pending')
      lines.push(`${PLATFORM_ICON[platform.platform]} данных ещё нет: источник не собирался.`);
    if (platform.state === 'error')
      lines.push(
        `⚠️ ${PLATFORM_NAME[platform.platform]}: последний сбор не удался — цифры на ${time(platform.lastSuccessAt, timezone)}.`
      );
  }
  const videos = new Map<string, { title: string; publishedAt: number; ageHours: number; cells: string[] }>();
  for (const platform of daily.platforms)
    for (const row of platform.rows) {
      const title = shortTitleOf(row.title, TITLE_MAX);
      const key = title.toLowerCase().replaceAll('ё', 'е');
      const video = videos.get(key) ?? { title, publishedAt: row.publishedAt, ageHours: row.ageHours, cells: [] };
      video.publishedAt = Math.max(video.publishedAt, row.publishedAt);
      video.ageHours = Math.min(video.ageHours, row.ageHours);
      video.cells.push(platformCell(platform.platform, row));
      videos.set(key, video);
    }
  if (videos.size === 0) return [...lines, 'Роликов пока нет.'];
  [...videos.values()]
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .forEach((video, index) =>
      lines.push(
        `${index + 1}. ${escapeHtml(video.title)} · ${ageText(video.ageHours)}`,
        `    ${video.cells.join('  ·  ')}`
      )
    );
  return lines;
}

/** The day's growth of each platform: the sum over its videos; «≈» when some growth is not a 24-hour pair. */
function dayTotals(daily: DailyAnalytics): string | null {
  const parts = daily.platforms.flatMap((platform) => {
    const counted = platform.rows.filter((row) => row.growth.kind === 'day' || row.growth.kind === 'window');
    if (counted.length === 0) return [];
    const total = counted.reduce((sum, row) => sum + (row.growth.views ?? 0), 0);
    const approximate = counted.some((row) => row.growth.kind === 'window');
    return [`${PLATFORM_ICON[platform.platform]} ${approximate ? '≈' : ''}+${compactCount(total)}`];
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

export function dailyReportHtml(input: {
  data: DailyReportData;
  timezone: string;
  /** The AI review, or why there is none; `null` with no reason for «/analytics», which never asks the model. */
  review: DailyReview | null;
  reviewError?: string | null;
}): string {
  const { daily, accuracy } = input.data;
  const day = new Intl.DateTimeFormat('ru-RU', { timeZone: input.timezone, day: 'numeric', month: 'long' }).format(
    new Date(daily.asOf)
  );
  const rows = keyedRows(daily);
  const totals = dayTotals(daily);
  const lines = [
    `<b>📊 Аналитика · ${day}</b>`,
    `Данные на ${time(daily.asOf, input.timezone)}${daily.partial ? ' · частично' : ''}`,
    ...(totals === null ? [] : [totals])
  ];
  const link = (key: string) => {
    const found = rows.find((row) => row.key === key);
    return found === undefined
      ? key
      : `<a href="${escapeHtml(cleanUrl(found.row.url))}">${escapeHtml(shortTitleOf(found.row.title, TITLE_MAX))}</a> (${PLATFORM_NAME[found.platform]})`;
  };
  if (input.review !== null) lines.push('', ...reviewBlock(input.review, link));
  else if (input.reviewError)
    lines.push('', `<i>🧠 Разбор недоступен: ${REVIEW_MISSING[input.reviewError] ?? 'ошибка ИИ'}.</i>`);
  lines.push('', ...videoLines(daily, input.timezone));
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
  formats?: ItemFormats;
  clock: Clock;
  timezone: string;
}): Promise<string> {
  const now = deps.clock.now();
  const [daily, accuracy] = await Promise.all([
    readDailyAnalytics({ repo: deps.analytics, clock: deps.clock, ...(deps.formats ? { formats: deps.formats } : {}) }),
    deps.forecasts.accuracy(now - 24 * HOUR_MS)
  ]);
  const html = dailyReportHtml({ data: { daily, accuracy }, timezone: deps.timezone, review: null });
  return `${html}\n\n<i>Разбор ИИ приходит в ежедневном отчёте.</i>`;
}
