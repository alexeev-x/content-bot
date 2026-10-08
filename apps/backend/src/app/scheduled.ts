import {
  ARCHIVE_LOOKBACK_SWEEP_MS,
  ARCHIVE_LOOKBACK_TICK_MS,
  archiveSentPosts,
  purgeExpiredArchive
} from '../modules/lifecycle';
import { dispatchDueJobs, type RaisedIncident, reconcileExpiredJobs } from '../modules/publishing';
import type { Container } from './container';
import { alertOwnerOfIncidents } from './notifications/alert-owner-of-incidents';
import { DotaWatchError } from '../modules/dota';

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
  | 'dispatchJobs'
  | 'lifecycle'
  | 'postRevisions'
  | 'transport'
  | 'sessions'
  | 'housekeeping'
  | 'ownerMessenger'
  | 'ownerChatId'
  | 'systemState'
  | 'random'
  | 'newId'
  | 'dotaWatcher'
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
//   7. dota watch: only on five-minute UTC boundaries, after publication work and alerts; bounded fetches
//      and one atomic D1 batch seed/deduplicate source records without touching publication state
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
          error instanceof DotaWatchError
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

  if (minute === 0) {
    await step('cleanup', async () => {
      const now = clock.now();
      const limit = CLEANUP_LIMIT;
      const platform = await container.housekeeping.purgeExpired({ now, limit });
      const identity = await container.sessions.purgeEnded({ now, limit, graceMs: SESSION_GRACE_MS });
      return {
        purgedIdempotencyKeys: platform.idempotencyKeys,
        purgedRateLimits: platform.rateLimits,
        purgedSignIns: identity.signIns,
        purgedSessions: identity.sessions
      };
    });
  }

  if (raised.length > 0) {
    const alerts = await alertOwnerOfIncidents(
      {
        repo: container.dispatchJobs,
        messenger: container.ownerMessenger,
        ownerChatId: container.ownerChatId,
        readAppOrigin: () => container.systemState.readAppOrigin(),
        clock,
        logger
      },
      raised
    );
    Object.assign(counts, { alertsSent: alerts.sent, alertsFailed: alerts.failed });
  }

  // Run after the publication pipeline and its alerts: feed ingestion never delays dispatch or
  // changes publication state. It runs only on exact five-minute UTC slots.
  if (controller.scheduledTime % (5 * 60_000) === 0) {
    await step('dota-watch', async () => {
      const summary = await container.dotaWatcher.sync({ detectedAt: clock.now() });
      return { dotaFeedsFetched: summary.fetched, dotaItemsInserted: summary.inserted };
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
