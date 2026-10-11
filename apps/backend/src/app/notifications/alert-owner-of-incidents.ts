import type { TelegramOwnerMessageApi } from '../../integrations/telegram/telegram-api';
import type { DispatchRepository, RaisedIncident } from '../../modules/publishing';
import type { Clock } from '../../platform/clock';
import type { Logger } from '../../platform/logging/logger';
import { AppError } from '../../shared/app-error';
import { createTelegramCaller } from '../bot/telegram-call';
import { formatIncidentAlertGroup } from './incident-alert';

// One alert must not hold the Cron invocation for long; nothing is retried.
export const ALERT_TIMEOUT_MS = 5_000;
// A tick raises at most DISPATCH_BATCH + RECONCILE_BATCH incidents; this only bounds the subrequests if that changes.
export const MAX_ALERTS_PER_TICK = 8;

export interface OwnerAlertDeps {
  repo: Pick<DispatchRepository, 'claimOwnerNotices'>;
  /** Null when the bot token is not set: the owner is simply not told. */
  messenger: TelegramOwnerMessageApi | null;
  /** The owner's Telegram ID: in a private chat the chat id is the user id. Null when it is not configured. */
  ownerChatId: string | null;
  /** This Worker's public origin as /start or connect stored it; Cron has no request to learn it from. */
  readAppOrigin: () => Promise<string | null>;
  clock: Clock;
  logger: Logger;
  timeoutMs?: number;
}

export interface OwnerAlertSummary {
  claimed: number;
  sent: number;
  failed: number;
}

// Tells the owner about incidents a tick has already written to D1. Best effort and never throws: the
// incident is stored whatever happens here, so a failure (Telegram, D1, a missing setting) ends as one
// log line with a stable code. It never writes an incident of its own, so a failing alert cannot
// recurse. The alert is claimed in D1 first (a conditional UPDATE), then sent once with no retry:
// at most one alert per incident however many ticks overlap, and a lost alert is preferred to a repeated one.
export async function alertOwnerOfIncidents(
  deps: OwnerAlertDeps,
  incidents: readonly RaisedIncident[]
): Promise<OwnerAlertSummary> {
  const summary: OwnerAlertSummary = { claimed: 0, sent: 0, failed: 0 };
  if (incidents.length === 0) return summary;
  const { logger } = deps;
  const log = (status: 'sent' | 'skipped' | 'failed', errorCode?: string) =>
    logger[status === 'failed' ? 'warn' : 'info']({
      component: 'owner_alert',
      operation: 'incident_alert',
      status,
      ...(errorCode === undefined ? {} : { errorCode })
    });

  const { messenger, ownerChatId } = deps;
  if (messenger === null || ownerChatId === null) {
    log('skipped', messenger === null ? 'BOT_TOKEN_MISSING' : 'OWNER_ID_MISSING');
    return summary;
  }

  let appOrigin: string | null;
  let claimedIds: string[];
  try {
    appOrigin = await deps.readAppOrigin();
    if (appOrigin === null) {
      log('skipped', 'APP_ORIGIN_UNKNOWN');
      return summary;
    }
    claimedIds = await deps.repo.claimOwnerNotices(
      incidents.slice(0, MAX_ALERTS_PER_TICK).map((incident) => incident.id),
      deps.clock.now()
    );
  } catch {
    summary.failed = incidents.length;
    log('failed', 'ALERT_STATE_UNAVAILABLE');
    return summary;
  }

  const won = incidents.filter((incident) => claimedIds.includes(incident.id));
  summary.claimed = won.length;
  const call = createTelegramCaller({ logger, timeoutMs: deps.timeoutMs ?? ALERT_TIMEOUT_MS });
  try {
    const message = formatIncidentAlertGroup(won, appOrigin);
    if (message === null) return summary;
    await call.act('incident_alert.send', (signal) =>
      messenger.sendMessageWithWebAppButton(ownerChatId, message, signal)
    );
    summary.sent = won.length;
    log('sent');
  } catch (error) {
    summary.failed = won.length;
    log('failed', error instanceof AppError ? error.code : 'UNEXPECTED_ERROR');
  }
  return summary;
}
