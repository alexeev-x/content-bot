import type { OwnerOperationsSettingsDto } from '@alexeev/contracts';
import type { TelegramOwnerMessageApi } from '../../integrations/telegram/telegram-api';
import type { DispatchRepository, OwnerIncidentAlertGroup } from '../../modules/publishing';
import type { Clock } from '../../platform/clock';
import type { Logger } from '../../platform/logging/logger';
import { AppError } from '../../shared/app-error';
import { createTelegramCaller } from '../bot/telegram-call';
import { formatOwnerIncidentOccurrence, formatOwnerIncidentRecovery } from './incident-alert';

export const ALERT_TIMEOUT_MS = 5_000;
// Keep enough of the Cron's 50-statement D1 budget for outcome writes; oldest-first prevents starvation.
export const MAX_ALERTS_PER_TICK = 2;
const ALERT_GROUP_PURGE_LIMIT = 25;

export interface OwnerAlertDeps {
  repo: Pick<
    DispatchRepository,
    | 'purgeOwnerIncidentAlertGroups'
    | 'listOwnerIncidentAlertGroups'
    | 'claimOwnerIncidentAlertGroup'
    | 'markOwnerIncidentAlertSent'
  >;
  messenger: TelegramOwnerMessageApi | null;
  /** In a private chat, the owner's Telegram id is the chat id. */
  ownerChatId: string | null;
  readAppOrigin: () => Promise<string | null>;
  readPreferences: () => Promise<OwnerOperationsSettingsDto>;
  clock: Clock;
  logger: Logger;
  timeoutMs?: number;
}

export interface OwnerAlertSummary {
  claimed: number;
  sent: number;
  failed: number;
}

function categoryEnabled(
  group: { kind: 'publish_failed' | 'publish_unknown'; recovery: boolean },
  settings: OwnerOperationsSettingsDto
): boolean {
  if (group.recovery) return settings.notifications.recoveryAlerts;
  // UNKNOWN may already exist in the channel, so it is critical and cannot be disabled.
  if (group.kind === 'publish_unknown') return true;
  // A failed publication is a warning; both the global warning and publication switches apply.
  return settings.notifications.warningsEnabled && settings.notifications.publicationAlerts;
}

/**
 * Claims grouped events before sending, with no Telegram retry. The group is durable across ticks;
 * an ambiguous send is intentionally treated as attempted, never resent for the same occurrence.
 */
export async function alertOwnerOfIncidents(deps: OwnerAlertDeps): Promise<OwnerAlertSummary> {
  const summary: OwnerAlertSummary = { claimed: 0, sent: 0, failed: 0 };
  const log = (status: 'sent' | 'skipped' | 'failed', errorCode?: string) =>
    deps.logger[status === 'failed' ? 'warn' : 'info']({
      component: 'owner_alert',
      operation: 'incident_alert',
      status,
      ...(errorCode === undefined ? {} : { errorCode })
    });

  let groups: OwnerIncidentAlertGroup[];
  let appOrigin: string | null;
  let preferences: OwnerOperationsSettingsDto;
  try {
    const now = deps.clock.now();
    await deps.repo.purgeOwnerIncidentAlertGroups(ALERT_GROUP_PURGE_LIMIT);
    groups = await deps.repo.listOwnerIncidentAlertGroups(now, MAX_ALERTS_PER_TICK);
    if (groups.length === 0) return summary;
    appOrigin = await deps.readAppOrigin();
    if (appOrigin === null) {
      log('skipped', 'APP_ORIGIN_UNKNOWN');
      return summary;
    }
    preferences = await deps.readPreferences();
  } catch {
    summary.failed = 1;
    log('failed', 'ALERT_STATE_UNAVAILABLE');
    return summary;
  }

  const { messenger, ownerChatId } = deps;
  if (messenger === null || ownerChatId === null) {
    log('skipped', messenger === null ? 'BOT_TOKEN_MISSING' : 'OWNER_ID_MISSING');
    return summary;
  }

  const call = createTelegramCaller({ logger: deps.logger, timeoutMs: deps.timeoutMs ?? ALERT_TIMEOUT_MS });
  for (const group of groups) {
    let claimed: boolean;
    try {
      claimed = await deps.repo.claimOwnerIncidentAlertGroup(group.groupKey, deps.clock.now(), group.recovery);
    } catch {
      summary.failed += 1;
      log('failed', 'ALERT_STATE_UNAVAILABLE');
      continue;
    }
    if (!claimed) continue;
    summary.claimed += 1;

    if (!categoryEnabled(group, preferences)) {
      log('skipped', 'ALERT_CATEGORY_DISABLED');
      continue;
    }

    try {
      const message = group.recovery
        ? formatOwnerIncidentRecovery(group, appOrigin)
        : formatOwnerIncidentOccurrence(group, appOrigin);
      await call.act(group.recovery ? 'incident_recovery.send' : 'incident_alert.send', (signal) =>
        messenger.sendMessageWithWebAppButton(ownerChatId, message, signal)
      );
      if (!group.recovery) await deps.repo.markOwnerIncidentAlertSent(group.groupKey, deps.clock.now());
      summary.sent += 1;
      log('sent');
    } catch (error) {
      summary.failed += 1;
      log('failed', error instanceof AppError ? error.code : 'UNEXPECTED_ERROR');
    }
  }
  return summary;
}
