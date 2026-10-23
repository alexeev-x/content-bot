import { z } from 'zod';
import { decodeKeysetCursor, encodeKeysetCursor } from '../../platform/pagination/keyset-cursor';
import { AppError } from '../../shared/app-error';
import type { ContentDailyReportRepository, DailyReportRow } from './d1-content-daily-reports-repository';
import type { ContentForecastRepository, StoredForecast } from './d1-content-forecasts-repository';
import {
  type DailyReportData,
  type DailyReview,
  dailyReportHtml,
  dailyReportRichHtml,
  reportTitleKeys,
  type VideoNames
} from './daily-report';
import type { ContentVideoNameRepository } from './d1-content-video-names-repository';
import { type WeeklyData, weeklyReportHtml } from './weekly-report';

// The studio's history of the daily and Monday reports (AI plan P8; SYS-03, SYS-04): what was stored, how the
// review went and, for a daily report, its forecasts with their scores. Read-only; the report rows stay as the
// release wrote them.

export const REPORT_PAGE = 20;
const HEADLINE_MAX = 300;
const BLOCKS_MAX = 40;

export interface ReportBlock {
  kind: 'text' | 'table';
  text: string;
}

type StoredReport = DailyReportData | WeeklyData;

const isWeekly = (data: StoredReport): data is WeeklyData => 'kind' in data && data.kind === 'weekly';

export interface ReportSummary {
  id: string;
  kind: 'day' | 'week';
  asOf: number;
  timezone: string;
  status: 'reviewed' | 'unreviewed';
  reviewError: string | null;
  model: string | null;
  usageId: string | null;
  headline: string | null;
}

function summaryOf(row: DailyReportRow, headline: string | null): ReportSummary {
  return {
    id: row.id,
    kind: row.id.startsWith('weekly:') ? 'week' : 'day',
    asOf: row.asOf,
    timezone: row.timezone,
    status: row.status === 'reviewed' ? 'reviewed' : 'unreviewed',
    reviewError: row.reviewError,
    model: row.model,
    usageId: row.usageId,
    headline
  };
}

const cursorSchema = z.tuple([z.number().int().nonnegative(), z.string().min(1).max(100)]);

/** Released reports newest first, a page at a time; the cursor is the last row of the previous page. */
export async function listReports(
  reports: Pick<ContentDailyReportRepository, 'listReleased'>,
  cursor: string | undefined
): Promise<{ items: ReportSummary[]; nextCursor: string | null }> {
  const after = cursor === undefined ? undefined : decodeKeysetCursor(cursor, cursorSchema);
  if (after === null) throw new AppError('VALIDATION_ERROR', 'Invalid cursor');
  const rows = await reports.listReleased({
    after: after === undefined ? null : { asOf: after[0], id: after[1] },
    limit: REPORT_PAGE + 1
  });
  const page = rows.slice(0, REPORT_PAGE);
  const last = page.at(-1);
  return {
    items: page.map((row) => summaryOf(row, listedHeadline(row))),
    nextCursor: rows.length > REPORT_PAGE && last !== undefined ? encodeKeysetCursor([last.asOf, last.id]) : null
  };
}

/**
 * The message as Telegram shows it: tags dropped, entities decoded. The «Открыть: 1 · 2» link rows are left out: without
 * their links they are only numbers.
 */
function plainText(html: string): string {
  return html
    .split('\n')
    .filter((line) => !line.startsWith('Открыть: '))
    .join('\n')
    .replace(/<[^>]+>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&');
}

export interface ReportDetail {
  summary: ReportSummary;
  /** The report's text from its stored numbers and review, in today's layout. */
  text: string;
  blocks: ReportBlock[];
  forecasts: (StoredForecast & { title: string | null; platform: string | null })[];
}

/** The report's message from its stored numbers and review, in today's layout; the numbers for the forecast titles. */
function rendered(row: DailyReportRow, names?: VideoNames): { html: string; data: StoredReport } {
  const data = JSON.parse(row.data) as StoredReport;
  let review: DailyReview | null = null;
  try {
    review = row.review === null ? null : (JSON.parse(row.review) as DailyReview);
  } catch {
    // A damaged review only loses the review; the numbers are still shown.
    review = null;
  }
  const html = isWeekly(data)
    ? weeklyReportHtml({ data, timezone: row.timezone, review, reviewError: row.reviewError })
    : dailyReportHtml({
        data,
        timezone: row.timezone,
        review,
        reviewError: row.reviewError,
        ...(names ? { names } : {})
      });
  return { html, data };
}

const HEADLINES = ['Главное: ', '🎬 Попробовать: '];
/** The layout of 22.10.2026 has no main line: its first new fact stands for it. */
const NEWS_HEADER = '🧠 Что нового';

/** The line the history shows under the date: the review's main fact, or its suggestion in an older review. */
function headlineOf(text: string): string | null {
  const lines = text.split('\n');
  for (const prefix of HEADLINES) {
    const line = lines.find((candidate) => candidate.startsWith(prefix));
    if (line !== undefined) {
      const value = line.slice(prefix.length).trim();
      return value === '' ? null : value.length > HEADLINE_MAX ? `${value.slice(0, HEADLINE_MAX - 1)}…` : value;
    }
  }
  const news = lines.indexOf(NEWS_HEADER);
  const first = news === -1 ? undefined : lines[news + 1]?.replace(/^•\s*/, '').trim();
  if (first === undefined || first === '') return null;
  return first.length > HEADLINE_MAX ? `${first.slice(0, HEADLINE_MAX - 1)}…` : first;
}

/** A list row's headline; a row whose numbers do not parse loses only its headline, not the page. */
function listedHeadline(row: DailyReportRow): string | null {
  try {
    return headlineOf(plainText(rendered(row).html));
  } catch {
    return null;
  }
}

/** The message in parts: prose, and the `<pre>` platform tables kept apart so the studio can set them in monospace. */
function blocksOf(html: string): ReportBlock[] {
  const blocks: ReportBlock[] = [];
  const push = (kind: ReportBlock['kind'], part: string) => {
    const text = plainText(part).replace(/^\n+|\s+$/g, '');
    if (text !== '') blocks.push({ kind, text });
  };
  let rest = html;
  for (let open = rest.indexOf('<pre>'); open !== -1; open = rest.indexOf('<pre>')) {
    const close = rest.indexOf('</pre>', open);
    if (close === -1) break;
    push('text', rest.slice(0, open));
    push('table', rest.slice(open + 5, close));
    rest = rest.slice(close + 6);
  }
  push('text', rest);
  return blocks.slice(0, BLOCKS_MAX);
}

export async function readReport(
  deps: {
    reports: Pick<ContentDailyReportRepository, 'find'>;
    forecasts: Pick<ContentForecastRepository, 'ofReport'>;
    names?: Pick<ContentVideoNameRepository, 'read'>;
  },
  id: string
): Promise<ReportDetail | null> {
  const row = await deps.reports.find(id);
  if (row === null || row.status === 'waiting') return null;
  const stored = JSON.parse(row.data) as StoredReport;
  const names =
    isWeekly(stored) || deps.names === undefined ? undefined : await deps.names.read(reportTitleKeys(stored));
  const { html, data } = rendered(row, names);
  const text = plainText(html);
  const videos = new Map<string, { title: string; platform: string }>();
  if (!isWeekly(data))
    for (const platform of data.daily.platforms)
      for (const item of platform.rows) videos.set(item.id, { title: item.title, platform: platform.platform });
  const forecasts = isWeekly(data) ? [] : await deps.forecasts.ofReport(id);
  return {
    summary: summaryOf(row, headlineOf(text)),
    text,
    blocks: blocksOf(html),
    forecasts: forecasts.map((forecast) => ({
      ...forecast,
      title: videos.get(forecast.itemId)?.title ?? null,
      platform: videos.get(forecast.itemId)?.platform ?? null
    }))
  };
}
const DAY_MS = 86_400_000;
const HORIZONS = [24, 72, 168] as const;

/** How the forecasts scored in the last `days`, per horizon, for «Как сбываются прогнозы». */
export async function readForecastAccuracy(
  forecasts: Pick<ContentForecastRepository, 'scoreboard'>,
  input: { now: number; days: number }
): Promise<{
  horizons: { hours: (typeof HORIZONS)[number]; inBand: number; below: number; above: number; noFact: number }[];
  waiting: number;
  nextTargetAt: number | null;
}> {
  const board = await forecasts.scoreboard(input.now - input.days * DAY_MS, input.now);
  const countOf = (hours: number, outcome: string) =>
    board.counts.find((row) => row.hours === hours && row.outcome === outcome)?.count ?? 0;
  return {
    horizons: HORIZONS.map((hours) => ({
      hours,
      inBand: countOf(hours, 'in_band'),
      below: countOf(hours, 'below'),
      above: countOf(hours, 'above'),
      noFact: countOf(hours, 'no_fact')
    })),
    waiting: board.waiting,
    nextTargetAt: board.nextTargetAt
  };
}

/**
 * The newest released daily and weekly reports as rich messages (Bot API 10.1), with their stored review: the DEV
 * rich sample (owner, 23.10.2026). Null for a kind not released yet or a daily report of an older layout.
 */
export async function latestRichReports(deps: {
  reports: Pick<ContentDailyReportRepository, 'listReleased' | 'find'>;
  names: Pick<ContentVideoNameRepository, 'read'>;
}): Promise<{ daily: string | null; weekly: string | null }> {
  const { items } = await listReports(deps.reports, undefined);
  const richOf = async (id: string | undefined): Promise<string | null> => {
    const row = id === undefined ? null : await deps.reports.find(id);
    if (row === null) return null;
    const data = JSON.parse(row.data) as StoredReport;
    let review: DailyReview | null = null;
    try {
      review = row.review === null ? null : (JSON.parse(row.review) as DailyReview);
    } catch {
      review = null;
    }
    if (isWeekly(data))
      return weeklyReportHtml({ data, timezone: row.timezone, review, reviewError: row.reviewError, rich: true });
    const names = await deps.names.read(reportTitleKeys(data));
    return dailyReportRichHtml({ data, timezone: row.timezone, review, reviewError: row.reviewError, names });
  };
  return {
    daily: await richOf(items.find((each) => each.kind === 'day')?.id),
    weekly: await richOf(items.find((each) => each.kind === 'week')?.id)
  };
}

/** A week read now and never stored (`readLastWeekData`) as a rich message, without a review. */
export function weeklyRichHtml(data: WeeklyData, timezone: string): string {
  return weeklyReportHtml({ data, timezone, review: null, rich: true });
}
