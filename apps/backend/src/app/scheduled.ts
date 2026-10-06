import { dispatchDueJobs, reconcileExpiredJobs } from '../modules/publishing';
import type { Container } from './container';

// Per table and per hourly tick; leftovers wait for the next hour.
export const CLEANUP_LIMIT = 100;
// Ended sessions stay this long for diagnosis before they are deleted.
const SESSION_GRACE_MS = 24 * 60 * 60 * 1000;

type TickContainer = Pick<
  Container,
  | 'clock'
  | 'logger'
  | 'publishing'
  | 'dispatchJobs'
  | 'postRevisions'
  | 'transport'
  | 'sessions'
  | 'housekeeping'
  | 'random'
  | 'newId'
>;

// Cron entry point, once a minute (docs/BACKEND_ARCHITECTURE.md §5). Ticks may overlap or repeat:
// every write below is a conditional claim or a guarded batch, so a second tick changes nothing
// the first one already decided.
//   1. reconcile: leases that ran out (always, even with the kill switch off)
//   2. dispatch: a small batch of due jobs (only when publishing is enabled)
//   3. cleanup: only on the tick of minute 0 of the hour, taken from the scheduled time, so no
//      state is kept between invocations
// An idle tick therefore costs two indexed reads that find no rows, and writes nothing.
export async function handleScheduled(controller: ScheduledController, container: TickContainer): Promise<void> {
  const { clock, logger } = container;
  const startedAt = clock.now();
  const counts: Record<string, number> = {};
  let failures = 0;

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
        errorCode: error instanceof Error ? error.name : 'unknown',
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

  if (new Date(controller.scheduledTime).getUTCMinutes() === 0) {
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

  logger.info({
    component: 'scheduled',
    operation: 'tick',
    status: failures === 0 ? 'ok' : 'error',
    cron: controller.cron,
    at: controller.scheduledTime,
    durationMs: clock.now() - startedAt,
    counts: { publishingEnabled: container.publishing.enabled ? 1 : 0, ...counts }
  });

  // The failure is already logged; throwing marks the Cron invocation as failed in the dashboard.
  if (failures > 0) throw new Error('SCHEDULED_TICK_FAILED');
}
