import { z } from 'zod';
import { decodeKeysetCursor, encodeKeysetCursor } from '../../platform/pagination/keyset-cursor';
import { AppError } from '../../shared/app-error';
import type { ContentDailyReportRepository, DailyReportRow } from './d1-content-daily-reports-repository';
import type { ContentForecastRepository, StoredForecast } from './d1-content-forecasts-repository';
import { type DailyReportData, type DailyReview, dailyReportHtml } from './daily-report';
import { type WeeklyData, weeklyReportHtml } from './weekly-report';

// The studio's history of the daily and Monday reports (AI plan P8; SYS-03, SYS-04): what was stored, how the
// review went and, for a daily report, its forecasts with their scores. Read-only; the report rows stay as the
// release wrote them.

export const REPORT_PAGE = 20;

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
}

function summaryOf(row: DailyReportRow): ReportSummary {
  return {
    id: row.id,
    kind: row.id.startsWith('weekly:') ? 'week' : 'day',
    asOf: row.asOf,
    timezone: row.timezone,
    status: row.status === 'reviewed' ? 'reviewed' : 'unreviewed',
    reviewError: row.reviewError,
    model: row.model,
    usageId: row.usageId
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
    items: page.map(summaryOf),
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
  forecasts: (StoredForecast & { title: string | null; platform: string | null })[];
}

export async function readReport(
  deps: {
    reports: Pick<ContentDailyReportRepository, 'find'>;
    forecasts: Pick<ContentForecastRepository, 'ofReport'>;
  },
  id: string
): Promise<ReportDetail | null> {
  const row = await deps.reports.find(id);
  if (row === null || row.status === 'waiting') return null;
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
    : dailyReportHtml({ data, timezone: row.timezone, review, reviewError: row.reviewError });
  const videos = new Map<string, { title: string; platform: string }>();
  if (!isWeekly(data))
    for (const platform of data.daily.platforms)
      for (const item of platform.rows) videos.set(item.id, { title: item.title, platform: platform.platform });
  const forecasts = isWeekly(data) ? [] : await deps.forecasts.ofReport(id);
  return {
    summary: summaryOf(row),
    text: plainText(html),
    forecasts: forecasts.map((forecast) => ({
      ...forecast,
      title: videos.get(forecast.itemId)?.title ?? null,
      platform: videos.get(forecast.itemId)?.platform ?? null
    }))
  };
}
