import type { PublicationStatus } from '@alexeev/contracts';
import type {
  DispatchRepository,
  PostRevisionSource,
  PublicationRepository,
  RangeSummary
} from '../../modules/publishing';
import type { Clock } from '../../platform/clock';
import { clip, escapeHtml } from '../notifications/schedule-notice';
import type { SystemStateStore } from '../system-state';
import {
  DEFAULT_OWNER_ZONE,
  dayBounds,
  formatAgo,
  formatClock,
  formatDay,
  formatShortDateTime,
  usableZone
} from './owner-time';

// How many publications /next lists.
export const NEXT_LIMIT = 5;
// Counts of problems stop here: "5+" says enough, and the read stays a handful of rows.
const PROBLEM_CAP = 5;
const INCIDENT_CAP = 20;
// A tick that is older than this means Cron is not running (it fires every minute).
const CRON_STALE_MS = 3 * 60_000;

export const STUDIO_BUTTON_TEXT = 'Открыть студию';
export const ALL_SCHEDULED_BUTTON_TEXT = 'Все запланированные';
export const PROBLEMS_BUTTON_TEXT = 'Разобраться';

export interface OwnerReply {
  /** Telegram HTML: every user-controlled part is escaped. */
  html: string;
  button: { text: string; url: string };
}

export interface OwnerReports {
  today(): Promise<OwnerReply>;
  next(): Promise<OwnerReply>;
  status(): Promise<OwnerReply>;
}

export interface OwnerReportDeps {
  clock: Clock;
  appOrigin: string;
  publications: Pick<PublicationRepository, 'list' | 'listUpcoming' | 'summarizeRange'>;
  incidents: Pick<DispatchRepository, 'countOpenIncidents'>;
  /** Titles of the posts /next lists: one primary-key lookup each, five at most. */
  posts: PostRevisionSource;
  cron: Pick<SystemStateStore, 'readCronRun'>;
  /** Whether the Cron dispatcher may claim jobs (the container's `publishing`). */
  publishing: { enabled: boolean; blockedBy?: 'bot_token_missing' };
}

const WAITING_STATUSES: readonly PublicationStatus[] = ['scheduled', 'queued', 'retry_wait', 'preparing', 'sending'];

function sum(counts: RangeSummary['counts'], statuses: readonly PublicationStatus[]): number {
  return statuses.reduce((total, status) => total + counts[status], 0);
}

function capped(count: number, cap: number): string {
  return count > cap ? `${cap}+` : String(count);
}

export function createOwnerReports(deps: OwnerReportDeps): OwnerReports {
  const { clock, appOrigin } = deps;

  // One bounded read: the latest publication carries the zone the owner last scheduled in.
  async function ownerZone(): Promise<string> {
    const [latest] = await deps.publications.list({ limit: 1, now: clock.now() });
    return latest === undefined ? DEFAULT_OWNER_ZONE : usableZone(latest.timezone);
  }

  return {
    async today() {
      const now = clock.now();
      const zone = await ownerZone();
      const { from, to } = dayBounds(now, zone);
      const { counts, nextWaitingAt } = await deps.publications.summarizeRange({ from, to, now });

      const waiting = sum(counts, WAITING_STATUSES);
      const results = [
        ['отправлено', counts.sent],
        ['не отправлено', counts.failed],
        ['неизвестно', counts.unknown],
        ['отменено', counts.cancelled]
      ] as const;
      const done = results.filter(([, count]) => count > 0).map(([label, count]) => `${label} ${count}`);

      const lines = [`<b>Сегодня, ${escapeHtml(formatDay(now, zone))}</b> (${escapeHtml(zone)})`];
      if (waiting + done.length === 0) {
        lines.push('', 'На сегодня публикаций нет.');
      } else {
        lines.push(
          '',
          waiting === 0
            ? 'План: всё обработано.'
            : `План: ждут отправки ${waiting}${nextWaitingAt === null ? '' : `, ближайшая в ${formatClock(nextWaitingAt, zone)}`}.`,
          `Итоги: ${done.length === 0 ? 'пока нет' : done.join(', ')}.`
        );
      }
      return { html: lines.join('\n'), button: { text: STUDIO_BUTTON_TEXT, url: `${appOrigin}/` } };
    },

    async next() {
      const [zone, upcoming] = await Promise.all([ownerZone(), deps.publications.listUpcoming(NEXT_LIMIT)]);
      const button = { text: ALL_SCHEDULED_BUTTON_TEXT, url: `${appOrigin}/publications?status=scheduled` };
      if (upcoming.length === 0) return { html: 'Запланированных публикаций нет.', button };

      const revisions = await Promise.all(
        upcoming.map((item) => deps.posts.findRevision(item.postId, item.postRevision))
      );
      const lines = upcoming.map((item, index) => {
        const title = revisions[index]?.title.trim() || 'Без названия';
        return `${index + 1}. ${escapeHtml(formatShortDateTime(item.scheduledAt, zone))} · ${escapeHtml(clip(item.destinationTitle))} · ${escapeHtml(clip(title))}`;
      });
      return {
        html: [`<b>Ближайшие публикации</b> (${escapeHtml(zone)})`, '', ...lines].join('\n'),
        button
      };
    },

    async status() {
      const now = clock.now();
      const [cron, unknown, failed, incidents] = await Promise.all([
        deps.cron.readCronRun(),
        deps.publications.list({ status: 'unknown', limit: PROBLEM_CAP + 1, now }),
        deps.publications.list({ status: 'failed', limit: PROBLEM_CAP + 1, now }),
        deps.incidents.countOpenIncidents(INCIDENT_CAP + 1)
      ]);

      const publishing = deps.publishing.enabled
        ? 'включена'
        : deps.publishing.blockedBy === 'bot_token_missing'
          ? 'включена, но не задан токен бота'
          : 'выключена';
      let cronLine: string;
      if (cron === null) {
        cronLine = 'нет данных о запусках';
      } else {
        cronLine = `последний запуск ${formatAgo(now - cron.at)}, ${cron.status === 'ok' ? 'без ошибок' : 'с ошибкой'}`;
        if (now - cron.at > CRON_STALE_MS) cronLine += ' (давно: проверьте Cron)';
      }
      const problems =
        unknown.length + failed.length + incidents === 0
          ? 'проблем нет'
          : `неизвестно ${capped(unknown.length, PROBLEM_CAP)}, не отправлено ${capped(failed.length, PROBLEM_CAP)}, открытых инцидентов ${capped(incidents, INCIDENT_CAP)}`;

      const target = unknown.length > 0 ? 'unknown' : failed.length > 0 ? 'failed' : null;
      return {
        html: ['<b>Статус</b>', '', `Публикация: ${publishing}`, `Cron: ${cronLine}`, `Проблемы: ${problems}`].join(
          '\n'
        ),
        button:
          target === null
            ? { text: STUDIO_BUTTON_TEXT, url: `${appOrigin}/` }
            : { text: PROBLEMS_BUTTON_TEXT, url: `${appOrigin}/publications?status=${target}` }
      };
    }
  };
}
