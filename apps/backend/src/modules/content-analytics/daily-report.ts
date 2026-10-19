import { zoned, zonedDate } from './alerts';
import { type DailyAnalytics, readDailyAnalytics } from './daily-analytics';
import type { DailyGrowth } from './daily-table';
import type { ContentAlertRepository } from './d1-content-alerts-repository';
import type { ContentAnalyticsRepository } from './d1-content-analytics-repository';
import type { ContentForecastRepository, ForecastOutcome } from './d1-content-forecasts-repository';
import { factAt } from './forecast-backtest';
import type { Clock } from '../../platform/clock';
import type { ItemFormats } from './types';

// The daily analytics report in the owner's private chat (AI plan P6, §4.2–4.3). The numbers come from the P4
// table and the P5 forecasts; the text is rendered here, by code, with no model. It is raised once a day as a
// content alert (`daily:<owner-zone date>:v1`, the alert id is the dedup key), so the existing sender gives it
// one attempt and leaves an unconfirmed send `unknown`, never resent.

const HOUR_MS = 60 * 60 * 1000;
export const DAILY_REPORT_VERSION = 'v1';
/** The scorer waits until the widest fact tolerance (6 h) has passed, so the closest reading exists. */
const SCORE_AFTER_MS = 6 * HOUR_MS;
const SCORE_LIMIT = 36;
/** A forecast shown in the conclusions needs this many readings behind it (plan §4.2: reliable history). */
const FORECAST_SHOWN_READINGS = 6;
/** Fewer scored forecasts than this is said to be too few to judge. */
const ACCURACY_MIN = 5;
const TITLE_CELL = 12;
const PLATFORM_NAME = { youtube: 'YouTube', tiktok: 'TikTok' } as const;

const escapeHtml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** 950 → «950», 12 400 → «12.4к», 410 000 → «410к», 1 250 000 → «1.3м». */
export function compactCount(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1000) return String(value);
  if (abs < 100_000) return `${(value / 1000).toFixed(1)}к`;
  if (abs < 1_000_000) return `${Math.round(value / 1000)}к`;
  return `${(value / 1_000_000).toFixed(1)}м`;
}

/** The table's growth cell: «+12.4к», «+1.2к/20ч» for another length, «сброс» for a dropped counter, «н/д». */
export function growthCell(growth: DailyGrowth): string {
  if (growth.kind === 'day') return `+${compactCount(growth.views)}`;
  if (growth.kind === 'window') return `+${compactCount(growth.views)}/${growth.hours}ч`;
  return growth.kind === 'anomaly' ? 'сброс' : 'н/д';
}

/** A fixed-width cell: wide emoji and pictographs would break the columns on a phone, so they go. */
function cell(text: string, width: number): string {
  const letters = Array.from(text.replace(/\p{Extended_Pictographic}|️/gu, '').trim());
  return (letters.length > width ? [...letters.slice(0, width - 1), '…'] : letters).join('').padEnd(width);
}

function platformBlock(platform: DailyAnalytics['platforms'][number], timezone: string): string[] {
  const name = PLATFORM_NAME[platform.platform];
  const lines = [`<b>${name}</b> · ${platform.rows.length} последних`];
  if (platform.state === 'pending') return [...lines, 'Данных ещё нет: источник не собирался.'];
  if (platform.state === 'error')
    lines.push(
      `⚠️ Последний сбор не удался (${escapeHtml(platform.errorCode ?? 'ошибка')}); цифры на ${time(platform.lastSuccessAt, timezone)}.`
    );
  if (platform.rows.length === 0) return [...lines, 'Роликов пока нет.'];
  const table = [
    `#  ${'Ролик'.padEnd(TITLE_CELL)} ${'Всего'.padStart(6)} ${'+24ч'.padStart(9)}`,
    ...platform.rows.map(
      (row, index) =>
        `${String(index + 1).padEnd(2)} ${cell(row.shortTitle, TITLE_CELL)} ${(row.views === null ? '—' : compactCount(row.views)).padStart(6)} ${growthCell(row.growth).padStart(9)}`
    )
  ];
  lines.push(`<pre>${escapeHtml(table.join('\n'))}</pre>`);
  lines.push(
    `Ролики: ${platform.rows.map((row, index) => `<a href="${escapeHtml(row.url)}">${index + 1}</a>`).join(' · ')}`
  );
  const stale = platform.rows.flatMap((row, index) => (row.status === 'ok' ? [] : [index + 1]));
  if (stale.length > 0) lines.push(`Нет свежего замера: ${stale.join(', ')}.`);
  return lines;
}

function time(at: number | null, timezone: string): string {
  if (at === null) return '—';
  return new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(
    new Date(at)
  );
}

/** Up to three short conclusions, each from stored numbers only (plan §4.2). */
function conclusions(daily: DailyAnalytics, accuracy: { scored: number; inBand: number }): string[] {
  const rows = daily.platforms.flatMap((platform) =>
    platform.rows.map((row) => ({ ...row, name: PLATFORM_NAME[platform.platform] }))
  );
  const lines: string[] = [];
  const leader = rows
    .filter((row) => row.growth.kind === 'day')
    .sort((a, b) => (b.growth.views ?? 0) - (a.growth.views ?? 0))[0];
  if (leader !== undefined && leader.growth.kind === 'day')
    lines.push(
      `🔥 Больше всех за сутки: ${escapeHtml(leader.shortTitle)} (${leader.name}) +${compactCount(leader.growth.views)}.`
    );
  const forecast = rows
    .filter((row) => row.forecast.quality === 'ok' && row.forecast.readings >= FORECAST_SHOWN_READINGS)
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];
  if (forecast !== undefined && forecast.forecast.quality === 'ok') {
    const week = forecast.forecast.horizons.find((row) => row.hours === 168);
    if (week !== undefined)
      lines.push(
        `🔮 ${escapeHtml(forecast.shortTitle)} (${forecast.name}) через 7 дней: ${compactCount(week.low)}–${compactCount(week.high)}.`
      );
  }
  if (accuracy.scored > 0)
    lines.push(
      `📈 Прогнозы за сутки: ${accuracy.inBand} из ${accuracy.scored} в диапазоне${accuracy.scored < ACCURACY_MIN ? ' (пока мало, рано судить)' : ''}.`
    );
  return lines.slice(0, 3);
}

export function dailyReportHtml(input: {
  daily: DailyAnalytics;
  timezone: string;
  accuracy: { scored: number; inBand: number };
}): string {
  const { daily, timezone } = input;
  const day = new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, day: 'numeric', month: 'long' }).format(
    new Date(daily.asOf)
  );
  const lines = [
    `<b>📊 Аналитика · ${day}</b>`,
    `Данные на ${time(daily.asOf, timezone)}${daily.partial ? ' · частично' : ''}`
  ];
  for (const platform of daily.platforms) lines.push('', ...platformBlock(platform, timezone));
  if (daily.platforms.some((platform) => platform.rows.some((row) => row.growth.kind === 'window')))
    lines.push('', '<i>«/20ч» — прирост не за сутки, а за указанные часы.</i>');
  if (daily.platforms.some((platform) => platform.rows.some((row) => row.growth.kind === 'anomaly')))
    lines.push('<i>«сброс» — счётчик уменьшился, прирост не считается.</i>');
  const found = conclusions(daily, input.accuracy);
  if (found.length > 0) lines.push('', ...found);
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
 * Raises today's report once the owner-zone hour is reached: scores due forecasts, builds the table, stores the
 * alert and the forecasts it shows. A report raised already, or an hour not reached, does nothing.
 */
export async function raiseDailyReport(deps: {
  analytics: ContentAnalyticsRepository;
  alerts: ContentAlertRepository;
  forecasts: ContentForecastRepository;
  formats?: ItemFormats;
  clock: Clock;
  timezone: string;
  hour: number;
}): Promise<{ raised: boolean }> {
  const now = deps.clock.now();
  if (zoned(now, deps.timezone).hour < deps.hour) return { raised: false };
  const id = `daily:${zonedDate(now, deps.timezone)}:${DAILY_REPORT_VERSION}`;
  if ((await deps.alerts.existing([id])).has(id)) return { raised: false };
  await scoreDueForecasts({ alerts: deps.alerts, forecasts: deps.forecasts, now });
  const accuracy = await deps.forecasts.accuracy(now - 24 * HOUR_MS);
  const daily = await readDailyAnalytics({
    repo: deps.analytics,
    clock: deps.clock,
    ...(deps.formats ? { formats: deps.formats } : {})
  });
  const html = dailyReportHtml({ daily, timezone: deps.timezone, accuracy });
  // The forecasts first, keyed by the report id: a Worker cut off before the alert leaves them, and the next tick
  // raises the alert (its forecasts are already stored, a repeat is ignored). The alert last is the day's claim.
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
  const raised = await deps.alerts.insert(
    [
      {
        id,
        kind: 'digest',
        title: 'Аналитика за день',
        body: 'Ежедневный отчёт по YouTube и TikTok.',
        html,
        buttons: [],
        linkPath: '/analytics'
      }
    ],
    now
  );
  return { raised: raised > 0 };
}

/** «Аналитика сейчас» in the bot: the same message at this moment, stored nowhere (no second daily report). */
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
  return dailyReportHtml({ daily, timezone: deps.timezone, accuracy });
}
