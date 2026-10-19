import type { DispatchRepository, PublicationRepository } from '../../modules/publishing';
import type { Clock } from '../../platform/clock';
import type { SystemStateStore } from '../system-state';
import { formatAgo } from './owner-time';

// Counts of problems stop here: "5+" says enough, and the read stays a handful of rows.
const PROBLEM_CAP = 5;
const INCIDENT_CAP = 20;
// A tick that is older than this means Cron is not running (it fires every minute).
const CRON_STALE_MS = 3 * 60_000;

const STUDIO_BUTTON_TEXT = 'Открыть студию';
const PROBLEMS_BUTTON_TEXT = 'Разобраться';

export interface OwnerReply {
  /** Telegram HTML: every user-controlled part is escaped. */
  html: string;
  button: { text: string; url: string };
}

export interface OwnerReports {
  status(): Promise<OwnerReply>;
}

export interface OwnerReportDeps {
  clock: Clock;
  appOrigin: string;
  publications: Pick<PublicationRepository, 'list'>;
  incidents: Pick<DispatchRepository, 'countOpenIncidents'>;
  cron: Pick<SystemStateStore, 'readCronRun'>;
  /** Whether the Cron dispatcher may claim jobs (the container's `publishing`). */
  publishing: { enabled: boolean; blockedBy?: 'bot_token_missing' };
}

function capped(count: number, cap: number): string {
  return count > cap ? `${cap}+` : String(count);
}

export function createOwnerReports(deps: OwnerReportDeps): OwnerReports {
  const { clock, appOrigin } = deps;

  return {
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
