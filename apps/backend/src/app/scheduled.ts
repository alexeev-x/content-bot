import {
  ARCHIVE_LOOKBACK_SWEEP_MS,
  ARCHIVE_LOOKBACK_TICK_MS,
  archiveSentPosts,
  purgeExpiredArchive
} from '../modules/lifecycle';
import { dispatchDueJobs, type RaisedIncident, reconcileExpiredJobs } from '../modules/publishing';
import type { Container } from './container';
import { alertOwnerOfIncidents } from './notifications/alert-owner-of-incidents';
import { getOwnerOperationsSettings } from '../modules/settings';
import { processDotaUpdates } from './workflows/process-dota-updates';
import { DotaWatchError } from '../modules/dota';
import { processPostMediaCleanup } from '../modules/content';
import { sendDotaWatchlistAlerts } from './workflows/process-dota-watchlist-alerts';
import { DotaHeroStatisticsError } from '../modules/dota-hero-statistics';

// Per table and per hourly tick; leftovers wait for the next hour.
export const CLEANUP_LIMIT = 100;
// The tick of this UTC minute purges expired archived posts (cleanup runs at minute 0).
const PURGE_MINUTE = 30;
// Ended sessions stay this long for diagnosis before they are deleted.
const SESSION_GRACE_MS = 24 * 60 * 60 * 1000;

type TickContainer = Pick<
  Container,
  | 'clock'
  | 'logger'
  | 'publishing'
  | 'settings'
  | 'dispatchJobs'
  | 'lifecycle'
  | 'postRevisions'
  | 'postMedia'
  | 'mediaStorage'
  | 'transport'
  | 'sessions'
  | 'housekeeping'
  | 'ownerMessenger'
  | 'ownerChatId'
  | 'systemState'
  | 'random'
  | 'newId'
  | 'dotaWatcher'
  | 'dotaRepository'
  | 'automations'
  | 'dotaHeroStatistics'
  | 'dotaWatchlists'
  | 'posts'
  | 'idempotency'
>;

// Cron entry point, once a minute (docs/BACKEND_ARCHITECTURE.md §5). Ticks may overlap or repeat:
// every write below is a conditional claim or a guarded batch, so a second tick changes nothing
// the first one already decided.
//   1. reconcile: leases that ran out (always, even with the kill switch off)
//   2. dispatch: a small batch of due jobs (only when publishing is enabled)
//   3. archive: posts whose publications just finished (a short window; the hourly tick looks back further)
//   4. purge: archived posts past their retention, only on the tick of minute 30 and only when that tick
//      dispatched nothing, so a busy tick never spends its budget on housekeeping
//   5. cleanup: only on the tick of minute 0 of the hour, taken from the scheduled time, so no
//      state is kept between invocations
//   6. alert: the owner hears about the incidents steps 1 and 2 wrote, after their state is stored
//      (best effort, nothing is retried; a tick without incidents spends nothing here)
//   7. dota watch: on five-minute UTC boundaries after publication work, only when that tick was idle and
//      not on the hourly housekeeping ticks; bounded work leaves the publishing D1 budget untouched
//   8. heartbeat: one upsert that records this run for the owner's /status
export async function handleScheduled(controller: ScheduledController, container: TickContainer): Promise<void> {
  const { clock, logger } = container;
  const startedAt = clock.now();
  const counts: Record<string, number> = {};
  let failures = 0;
  const raised: RaisedIncident[] = [];

  const step = async (operation: string, run: () => Promise<Record<string, number>>): Promise<void> => {
    const stepStartedAt = clock.now();
    try {
      Object.assign(counts, await run());
    } catch (error) {
      failures += 1;
      logger.error({
        component: 'scheduled',
        operation,
        status: 'error',
        errorCode:
          error instanceof DotaHeroStatisticsError
            ? error.code
            : error instanceof DotaWatchError
              ? `${error.code}_${error.sourceKey}`
              : error instanceof Error
                ? error.name
                : 'unknown',
        durationMs: clock.now() - stepStartedAt
      });
    }
  };

  await step('reconcile', async () => {
    const summary = await reconcileExpiredJobs({
      repo: container.dispatchJobs,
      clock,
      logger,
      newId: container.newId,
      random: container.random
    });
    raised.push(...summary.raised);
    return {
      expired: summary.expired,
      reconciledRetry: summary.retryWait,
      reconciledUnknown: summary.unknown,
      reconciledFailed: summary.failed
    };
  });

  if (container.publishing.enabled) {
    await step('dispatch', async () => {
      const summary = await dispatchDueJobs({
        repo: container.dispatchJobs,
        posts: container.postRevisions,
        transport: container.transport,
        clock,
        logger,
        newId: container.newId,
        random: container.random
      });
      if (summary.errors > 0) failures += 1;
      raised.push(...summary.raised);
      return {
        due: summary.due,
        lost: summary.lost,
        sent: summary.sent,
        retryWait: summary.retryWait,
        failed: summary.failed,
        unknown: summary.unknown,
        notSent: summary.notSent
      };
    });
  } else if (container.publishing.blockedBy !== undefined) {
    // Switched on but unable to send: say so on every tick instead of idling silently.
    logger.warn({
      component: 'scheduled',
      operation: 'dispatch',
      status: 'blocked',
      errorCode: 'BOT_TOKEN_MISSING'
    });
  }

  const minute = new Date(controller.scheduledTime).getUTCMinutes();
  const mediaStorage = container.mediaStorage;

  await step('archive', async () => {
    const { archived } = await archiveSentPosts(
      { repo: container.lifecycle, now: clock.now() },
      { lookbackMs: minute === 0 ? ARCHIVE_LOOKBACK_SWEEP_MS : ARCHIVE_LOOKBACK_TICK_MS }
    );
    return { archived };
  });

  if (minute === PURGE_MINUTE && (counts.due ?? 0) === 0) {
    await step('purge', async () => {
      const { purged } = await purgeExpiredArchive({ repo: container.lifecycle, now: clock.now() });
      return { purgedPosts: purged };
    });
  }

  // Deletion cascades leave only private object keys in a durable queue. R2 failures are retried
  // on hourly idle ticks; reads stop resolving detached media immediately.
  if (minute === 0 && (counts.due ?? 0) === 0 && mediaStorage !== undefined) {
    await step('media-cleanup', async () => {
      const result = await processPostMediaCleanup(
        { repo: container.postMedia, storage: mediaStorage },
        5,
        clock.now()
      );
      if (result.failed > 0) failures += 1;
      return { mediaObjectsCleaned: result.cleaned, mediaObjectCleanupFailed: result.failed };
    });
  }

  if (minute === 0) {
    await step('cleanup', async () => {
      const now = clock.now();
      const limit = CLEANUP_LIMIT;
      const platform = await container.housekeeping.purgeExpired({ now, limit });
      const identity = await container.sessions.purgeEnded({ now, limit, graceMs: SESSION_GRACE_MS });
      const idle = failures === 0 && (counts.expired ?? 0) === 0 && (counts.due ?? 0) === 0 && raised.length === 0;
      const operational = idle
        ? await container.housekeeping.purgeOperational({ now, limit })
        : { jobAttempts: 0, resolvedIncidents: 0, auditRows: 0 };
      const dotaHeroStatsSnapshots = idle ? await container.dotaHeroStatistics.purgeExpiredSnapshots(now, limit) : 0;
      const automationRuns = idle ? await container.automations.purgeHistory(now, limit) : 0;
      return {
        purgedIdempotencyKeys: platform.idempotencyKeys,
        purgedRateLimits: platform.rateLimits,
        purgedSignIns: identity.signIns,
        purgedSessions: identity.sessions,
        purgedJobAttempts: operational.jobAttempts,
        purgedResolvedIncidents: operational.resolvedIncidents,
        purgedAuditRows: operational.auditRows,
        purgedDotaHeroStatsSnapshots: dotaHeroStatsSnapshots,
        purgedAutomationRuns: automationRuns
      };
    });
  }

  const alerts = await alertOwnerOfIncidents({
    repo: container.dispatchJobs,
    messenger: container.ownerMessenger,
    ownerChatId: container.ownerChatId,
    readAppOrigin: () => container.systemState.readAppOrigin(),
    readPreferences: () => getOwnerOperationsSettings({ repo: container.settings, logger, requestId: 'scheduled' }),
    clock,
    logger
  });
  Object.assign(counts, { alertsSent: alerts.sent, alertsFailed: alerts.failed });

  // Run after the publication pipeline and its alerts: automation work never delays dispatch or
  // changes publication state. Expired automation leases are visible as unknown and never retried.
  await step('automation-reconcile', async () => ({
    automationRunsUnknown: await container.automations.markExpiredUnknown(clock.now())
  }));
  const publicationIdle =
    failures === 0 && (counts.expired ?? 0) === 0 && (counts.due ?? 0) === 0 && raised.length === 0;
  if (publicationIdle) {
    await step('dota-watch', async (): Promise<Record<string, number>> => {
      if (controller.scheduledTime % (5 * 60_000) === 0 && minute !== 0 && minute !== PURGE_MINUTE) {
        await container.automations.enqueueScheduled({
          id: 'dota-intelligence',
          slot: controller.scheduledTime,
          requestedAt: clock.now(),
          newId: container.newId
        });
      }
      const run = await container.automations.claimNext({ id: 'dota-intelligence', now: clock.now() });
      if (run === null) return {};
      try {
        const dotaWatcher = container.dotaWatcher;
        const summary = await processDotaUpdates({
          sync: dotaWatcher.sync,
          summarizePatch: dotaWatcher.summarizePatch,
          ...(dotaWatcher.inspectPatch === undefined ? {} : { inspectPatch: dotaWatcher.inspectPatch }),
          repo: container.dotaRepository,
          posts: container.posts,
          idempotency: container.idempotency,
          actor: container.ownerChatId ?? 'system',
          now: () => clock.now(),
          newId: container.newId,
          messenger: container.ownerMessenger,
          ownerChatId: container.ownerChatId,
          readAppOrigin: () => container.systemState.readAppOrigin(),
          readNotificationPreferences: async () =>
            (await getOwnerOperationsSettings({ repo: container.settings, logger, requestId: 'scheduled' }))
              .notifications,
          logger
        });
        if (summary.sourceFailures > 0) failures += 1;
        const notifications = (
          await getOwnerOperationsSettings({ repo: container.settings, logger, requestId: 'scheduled' })
        ).notifications;
        const watchMatches = await container.dotaWatchlists.processMatches({
          now: clock.now(),
          newId: container.newId,
          notificationsEnabled: notifications.dotaWatchlistAlerts
        });
        const watchAlerts = await sendDotaWatchlistAlerts({
          repo: container.dotaWatchlists,
          messenger: container.ownerMessenger,
          ownerChatId: container.ownerChatId,
          now: () => clock.now(),
          logger,
          appOrigin: await container.systemState.readAppOrigin()
        });
        const runStatus =
          summary.sourceFailures > 0 || watchAlerts.failed > 0
            ? 'failed'
            : watchAlerts.unknown > 0
              ? 'unknown'
              : 'succeeded';
        await container.automations.finish({
          runId: run.id,
          now: clock.now(),
          status: runStatus,
          outputCount: summary.itemsInserted + summary.draftsCreated + watchMatches.matched + watchAlerts.sent,
          ...(summary.sourceFailures > 0
            ? { errorCode: 'DOTA_SOURCE_FAILURE' }
            : watchAlerts.failed > 0
              ? { errorCode: 'DOTA_WATCH_ALERT_FAILED' }
              : watchAlerts.unknown > 0
                ? { errorCode: 'DOTA_WATCH_ALERT_UNKNOWN' }
                : {})
        });
        if (summary.sourceFailures > 0) failures += 1;
        return {
          dotaFeedsFetched: summary.feedsFetched,
          dotaItemsInserted: summary.itemsInserted,
          dotaDraftsCreated: summary.draftsCreated,
          dotaDraftAlertsSent: summary.draftAlertsSent,
          dotaSourceAlertsSent: summary.sourceAlertsSent,
          dotaSourceFailures: summary.sourceFailures,
          dotaWatchMatches: watchMatches.matched,
          dotaWatchAlertsSent: watchAlerts.sent,
          dotaWatchAlertsFailed: watchAlerts.failed,
          dotaWatchAlertsUnknown: watchAlerts.unknown,
          dotaWatchAlertsDisabled: watchMatches.disabled,
          dotaWatchAlertsRecoveredUnknown: watchMatches.unknown
        };
      } catch (error) {
        await container.automations.finish({
          runId: run.id,
          now: clock.now(),
          status: 'failed',
          outputCount: 0,
          errorCode: error instanceof DotaWatchError ? `${error.code}_${error.sourceKey}` : 'AUTOMATION_RUN_FAILED'
        });
        throw error;
      }
    });
  }

  const scheduledDate = new Date(controller.scheduledTime);
  if (publicationIdle) {
    await step('dota-hero-statistics', async (): Promise<Record<string, number>> => {
      if (minute === 15 && scheduledDate.getUTCHours() % 6 === 0) {
        await container.automations.enqueueScheduled({
          id: 'dota-hero-statistics',
          slot: controller.scheduledTime,
          requestedAt: clock.now(),
          newId: container.newId
        });
      }
      const run = await container.automations.claimNext({ id: 'dota-hero-statistics', now: clock.now() });
      if (run === null) return {};
      try {
        const result = await container.dotaHeroStatistics.poll({
          now: clock.now(),
          newId: container.newId
        });
        await container.automations.finish({
          runId: run.id,
          now: clock.now(),
          status: result.status === 'stored' ? 'succeeded' : 'skipped',
          outputCount: result.heroCount ?? 0,
          ...(result.status === 'not_due' ? { errorCode: 'DOTA_HERO_STATS_POLL_NOT_CLAIMED' } : {})
        });
        return {
          dotaHeroStatsSnapshotsStored: result.status === 'stored' ? 1 : 0,
          dotaHeroStatsHeroesStored: result.heroCount ?? 0
        };
      } catch (error) {
        await container.automations.finish({
          runId: run.id,
          now: clock.now(),
          status: 'failed',
          outputCount: 0,
          errorCode: error instanceof DotaHeroStatisticsError ? error.code : 'AUTOMATION_RUN_FAILED'
        });
        throw error;
      }
    });
  }

  const durationMs = clock.now() - startedAt;
  const status = failures === 0 ? 'ok' : 'error';
  // Not a tick failure when it cannot be written (a deployment before migration 0009): the work above is done.
  try {
    await container.systemState.recordCronRun({ at: clock.now(), status, durationMs });
  } catch (error) {
    logger.warn({
      component: 'scheduled',
      operation: 'heartbeat',
      status: 'error',
      errorCode: error instanceof Error ? error.name : 'unknown'
    });
  }

  logger.info({
    component: 'scheduled',
    operation: 'tick',
    status,
    cron: controller.cron,
    at: controller.scheduledTime,
    durationMs,
    counts: { publishingEnabled: container.publishing.enabled ? 1 : 0, ...counts }
  });

  // The failure is already logged; throwing marks the Cron invocation as failed in the dashboard.
  if (failures > 0) throw new Error('SCHEDULED_TICK_FAILED');
}
