import type { Clock } from '../../../platform/clock';
import type { Logger } from '../../../platform/logging/logger';
import { attemptsExhausted, RECONCILE_BATCH, retryRunAt } from '../domain/dispatch-policy';
import type { DispatchRepository, ExpiredClaim, ExpiredResolution, JobResolution, RaisedIncident } from './ports';

export interface ReconcileDeps {
  repo: DispatchRepository;
  clock: Clock;
  logger: Logger;
  newId: () => string;
  random: () => number;
}

export interface ReconcileSummary {
  expired: number;
  retryWait: number;
  unknown: number;
  failed: number;
  /** The job moved on (the original dispatcher finished) between the read and the write. */
  skipped: number;
  /** The incidents this tick wrote (an unconfirmed send, exhausted attempts), for the owner alert. */
  raised: RaisedIncident[];
}

// Cron tick step 1 (docs/BACKEND_ARCHITECTURE.md §5): a claim whose lease ran out has a dead
// dispatcher behind it. Without the send mark nothing was sent, so the job goes back to
// retry_wait (or fails once its attempts are used up). With the mark the post may be out there:
// the job becomes `unknown` with an incident and is never retried automatically.
// An idle tick costs one indexed read that finds no rows.
export async function reconcileExpiredJobs(deps: ReconcileDeps): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { expired: 0, retryWait: 0, unknown: 0, failed: 0, skipped: 0, raised: [] };
  const now = deps.clock.now();
  const claims = await deps.repo.findExpiredClaims(now, RECONCILE_BATCH);
  summary.expired = claims.length;
  if (claims.length === 0) return summary;

  const items = claims.map((claim) => planResolution(deps, claim, now));
  const applied = await deps.repo.resolveExpired(items, now);

  items.forEach(({ resolution }, index) => {
    if (applied[index] !== true) {
      summary.skipped += 1;
      return;
    }
    if (resolution.status === 'unknown') summary.unknown += 1;
    else if (resolution.status === 'failed') summary.failed += 1;
    else summary.retryWait += 1;
    if (resolution.incident !== null) {
      summary.raised.push({
        id: resolution.incident.id,
        kind: resolution.incident.kind,
        code: resolution.incident.code,
        publicationId: resolution.publicationId,
        postTitle: null,
        channelTitle: null
      });
    }
    deps.logger.warn({
      component: 'reconcile',
      operation: 'expired_claim',
      jobId: resolution.jobId,
      attempt: resolution.attempt,
      status: resolution.status,
      ...(resolution.errorCode === null ? {} : { errorCode: resolution.errorCode })
    });
  });
  return summary;
}

function planResolution(deps: ReconcileDeps, claim: ExpiredClaim, now: number): ExpiredResolution {
  const base = {
    jobId: claim.jobId,
    publicationId: claim.publicationId,
    attempt: claim.attempt,
    startedAt: Math.min(claim.startedAt, now),
    finishedAt: now,
    retryAfterSec: null,
    externalMessageId: null
  };
  const sendStarted = claim.sendStartedAt !== null;

  let resolution: JobResolution;
  if (sendStarted) {
    resolution = {
      ...base,
      status: 'unknown',
      attemptOutcome: 'unknown',
      errorCode: 'SEND_UNCONFIRMED',
      incident: {
        id: deps.newId(),
        kind: 'publish_unknown',
        code: 'SEND_UNCONFIRMED',
        details: { attempt: claim.attempt, reason: 'lease_expired_after_send_mark' }
      },
      auditAction: 'job.unknown'
    };
  } else if (attemptsExhausted(claim.attempt)) {
    resolution = {
      ...base,
      status: 'failed',
      attemptOutcome: 'lease_expired',
      errorCode: 'RETRIES_EXHAUSTED',
      incident: {
        id: deps.newId(),
        kind: 'publish_failed',
        code: 'RETRIES_EXHAUSTED',
        details: { attempt: claim.attempt, last: 'LEASE_EXPIRED' }
      },
      auditAction: 'job.failed'
    };
  } else {
    resolution = {
      ...base,
      status: 'retry_wait',
      runAt: retryRunAt({ now, attempt: claim.attempt, random: deps.random() }),
      attemptOutcome: 'lease_expired',
      errorCode: 'LEASE_EXPIRED',
      incident: null,
      auditAction: 'job.retry_wait'
    };
  }
  return { resolution, sendStarted };
}
