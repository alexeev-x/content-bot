import type { ContentAlertRepository } from './d1-content-alerts-repository';
import type { ContentDailyReportRepository, DailyReportRow } from './d1-content-daily-reports-repository';
import { type DailyReportData, type DailyReview, dailyReportHtml, dailyReviewFacts } from './daily-report';
import { type WeeklyData, weeklyReportHtml, weeklyReviewFacts } from './weekly-report';

// Releasing a stored daily or weekly report (AI plan P6): the review job or the deadline turns it into its one
// message, a content alert with the report's id. Both kinds share the table (migration 0077) and these rules.

/** A report still without its review after this long goes out with the numbers alone. */
export const REVIEW_DEADLINE_MS = 30 * 60 * 1000;
/** A report still waiting after this long is about a day gone: it is closed, not sent. */
const REPORT_STALE_MS = 20 * 60 * 60 * 1000;
/** Telegram counts a message's characters after entity parsing; this much room is kept below its 4096. */
const MESSAGE_MAX = 3900;

/** The characters Telegram counts: the text without tags, entities decoded. */
export function visibleLength(html: string): number {
  return Array.from(
    html
      .replace(/<[^>]+>/g, '')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&amp;', '&')
  ).length;
}

type StoredReport = DailyReportData | WeeklyData;

/** The stored JSON: a weekly report says so; a daily one is the older shape without `kind`. */
function dataOf(report: DailyReportRow): StoredReport {
  return JSON.parse(report.data) as StoredReport;
}

const isWeekly = (data: StoredReport): data is WeeklyData => 'kind' in data && data.kind === 'weekly';

/** The facts for the review job of a stored report; null when it is gone or no longer waiting. */
export async function dailyReviewInput(
  reports: Pick<ContentDailyReportRepository, 'find'>,
  id: string
): Promise<(ReturnType<typeof dailyReviewFacts> & { period: 'day' | 'week' }) | null> {
  const report = await reports.find(id);
  if (report === null || report.status !== 'waiting') return null;
  const data = dataOf(report);
  return isWeekly(data)
    ? { ...weeklyReviewFacts(data, report.timezone), period: 'week' }
    : { ...dailyReviewFacts(data), period: 'day' };
}

/**
 * Turns a waiting report into its message, with the review or the reason there is none, and raises it as the
 * day's content alert. The alert first (its id dedups a second releaser), then the report row ends.
 */
export async function releaseDailyReport(
  deps: {
    reports: ContentDailyReportRepository;
    alerts: Pick<ContentAlertRepository, 'insert'>;
    now: number;
  },
  input: { id: string; review: DailyReview | null; reviewError: string | null; model: string | null }
): Promise<boolean> {
  const report = await deps.reports.find(input.id);
  if (report === null || report.status !== 'waiting') return false;
  const data = dataOf(report);
  const render = (review: DailyReview | null, reviewError: string | null) =>
    isWeekly(data)
      ? weeklyReportHtml({ data, timezone: report.timezone, review, reviewError })
      : dailyReportHtml({ data, timezone: report.timezone, review, reviewError });
  let { review, reviewError } = input;
  let html = render(review, reviewError);
  // A review that does not fit would make Telegram refuse the whole message: the numbers go alone instead.
  if (review !== null && visibleLength(html) > MESSAGE_MAX) {
    review = null;
    reviewError = 'AI_TOO_LONG';
    html = render(null, reviewError);
  }
  const inserted = await deps.alerts.insert(
    [
      {
        id: report.id,
        kind: 'digest',
        title: isWeekly(data) ? 'Итоги недели' : 'Аналитика за день',
        body: isWeekly(data) ? 'Еженедельный отчёт.' : 'Ежедневный отчёт по YouTube и TikTok.',
        html,
        buttons: [],
        linkPath: '/analytics'
      }
    ],
    deps.now
  );
  // Only the releaser whose alert went in records what was sent; the other one changes nothing.
  if (inserted === 0) return false;
  return deps.reports.finish({
    id: report.id,
    status: review === null ? 'unreviewed' : 'reviewed',
    review: review === null ? null : JSON.stringify(review),
    reviewError,
    model: input.model,
    now: deps.now
  });
}

/** Reports whose review did not come in time go out with the numbers alone (AI off, a lost job, a slow model). */
export async function releaseOverdueReports(deps: {
  reports: ContentDailyReportRepository;
  alerts: Pick<ContentAlertRepository, 'insert'>;
  now: number;
}): Promise<number> {
  let released = 0;
  for (const report of await deps.reports.listWaiting(deps.now - REVIEW_DEADLINE_MS, 2)) {
    // A day long gone (the report was off, then on again) is closed without a message about old numbers.
    if (report.createdAt < deps.now - REPORT_STALE_MS) {
      await deps.reports.finish({
        id: report.id,
        status: 'unreviewed',
        review: null,
        reviewError: 'EXPIRED',
        model: null,
        now: deps.now
      });
      continue;
    }
    if (await releaseDailyReport(deps, { id: report.id, review: null, reviewError: 'REVIEW_TIMEOUT', model: null }))
      released += 1;
  }
  return released;
}
