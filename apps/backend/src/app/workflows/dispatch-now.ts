import { dispatchDueJobs } from '../../modules/publishing';
import { getOwnerOperationsSettings } from '../../modules/settings';
import type { Container } from '../container';
import { notifyOwnerOfDeliveries } from '../notifications/sent-notice';
import { rehearsalSendFault } from '../rubric-scheduler/rehearsal-send';

// A publication due now is sent at once instead of on the next Cron tick (review 24.10.2026: every automatic post
// waited 30 s on average, up to a minute). The queue message only wakes the same dispatcher Cron runs: the conditional
// claim, the send mark and the outcome classification are unchanged, so a kick racing a tick sends nothing twice (the
// loser finds the job claimed). Cron stays the fallback: a lost kick is today's behaviour. Incidents it raises are
// stored, and the next tick's alert step tells the owner, as for the tick's own dispatch.

/** Wakes the dispatcher; a refused send is only logged, the next Cron tick sends the post anyway. */
export async function kickDispatch(container: Pick<Container, 'aiJobs' | 'newId' | 'logger'>): Promise<void> {
  await container.aiJobs.send({ id: container.newId(), kind: 'dispatch_now' }).catch((error: unknown) =>
    container.logger.warn({
      component: 'dispatch_now',
      operation: 'enqueue',
      errorCode: error instanceof Error ? error.name : 'unknown'
    })
  );
}

/** One run of the dispatcher from the queue, with the «Опубликовано» notices of what it sent. */
export async function runDispatchNow(container: Container, requestId: string): Promise<void> {
  if (!container.publishing.enabled) return;
  const { clock, logger } = container;
  const startedAt = clock.now();
  const rehearse = rehearsalSendFault(container);
  const summary = await dispatchDueJobs({
    repo: container.dispatchJobs,
    posts: container.postRevisions,
    transport: container.transport,
    clock,
    logger,
    newId: container.newId,
    random: container.random,
    ...(rehearse === undefined ? {} : { rehearse })
  });
  logger.info({
    component: 'dispatch_now',
    operation: 'dispatch',
    requestId,
    status: summary.errors > 0 ? 'error' : 'ok',
    durationMs: clock.now() - startedAt,
    counts: {
      due: summary.due,
      sent: summary.sent,
      lost: summary.lost,
      unknown: summary.unknown,
      failed: summary.failed,
      retryWait: summary.retryWait
    }
  });
  if (summary.delivered.length === 0) return;
  await notifyOwnerOfDeliveries(
    {
      messenger: container.ownerMessenger,
      ownerChatId: container.ownerChatId,
      readAppOrigin: () => container.systemState.readAppOrigin(),
      readPreferences: () => getOwnerOperationsSettings({ repo: container.settings, logger, requestId }),
      logger
    },
    summary.delivered
  );
}
