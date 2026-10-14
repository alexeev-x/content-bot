import type { PostEntity } from '@alexeev/contracts';
import type { Clock } from '../../../platform/clock';
import type { Logger } from '../../../platform/logging/logger';
import { attemptsExhausted, DISPATCH_BATCH, LEASE_MS, minLeaseForSend, retryRunAt } from '../domain/dispatch-policy';
import { formatPublicationText } from '../domain/format-message';
import type {
  ClaimedJob,
  DispatchRepository,
  JobResolution,
  PostRevisionSource,
  PublicationTransport,
  RaisedIncident,
  SendOutcome
} from './ports';

export interface DispatchDeps {
  repo: DispatchRepository;
  posts: PostRevisionSource;
  transport: PublicationTransport;
  clock: Clock;
  logger: Logger;
  newId: () => string;
  /** In [0, 1): spreads retries so rate-limited jobs do not all return in the same minute. */
  random: () => number;
}

export interface DispatchSummary {
  due: number;
  lost: number;
  sent: number;
  retryWait: number;
  failed: number;
  unknown: number;
  notSent: number;
  errors: number;
  /** The incidents this tick wrote, for the owner alert; the caller sends it after the tick's state is stored. */
  raised: RaisedIncident[];
  /** Sends whose `succeeded` write was applied, for the owner's «Опубликовано» notice (sent after the tick). */
  delivered: DeliveredPublication[];
}

export interface DeliveredPublication {
  publicationId: string;
  postTitle: string | null;
  channelTitle: string | null;
  chatId: string | null;
  externalMessageId: string | null;
}

type JobResult = 'lost' | 'sent' | 'retry_wait' | 'failed' | 'unknown' | 'not_sent' | 'failed_halt';

// Outcome-write retries one tick may spend. A hiccup in D1 usually affects the next write too, and
// each retry costs queries of the invocation's budget (docs/BACKEND_ARCHITECTURE.md §5).
// `raised` collects the incidents whose write was applied.
interface TickBudget {
  writeRetries: number;
  raised: RaisedIncident[];
  delivered: DeliveredPublication[];
}

// What the owner alert can say about a job, filled in as the dispatcher loads it.
interface AlertContext {
  postTitle: string | null;
  channelTitle: string | null;
  chatId: string | null;
}

// One tick's dispatch (docs/BACKEND_ARCHITECTURE.md §5): a small batch of due jobs, each handled
// to the end before the next one starts. Per job: claim, load what to send, validate, mark the
// send, call Telegram once, write the outcome. An infrastructure error stops the tick: whatever
// was claimed is recovered by reconcile once its lease runs out.
export async function dispatchDueJobs(deps: DispatchDeps): Promise<DispatchSummary> {
  const summary: DispatchSummary = {
    due: 0,
    lost: 0,
    sent: 0,
    retryWait: 0,
    failed: 0,
    unknown: 0,
    notSent: 0,
    errors: 0,
    raised: [],
    delivered: []
  };
  const jobIds = await deps.repo.findDueJobIds(deps.clock.now(), DISPATCH_BATCH);
  summary.due = jobIds.length;
  const budget: TickBudget = { writeRetries: 1, raised: summary.raised, delivered: summary.delivered };

  for (const jobId of jobIds) {
    const startedAt = deps.clock.now();
    try {
      const result = await dispatchJob(deps, jobId, budget);
      count(summary, result);
      // The bot token is wrong: every further job would be refused the same way, so do not burn the batch.
      if (result === 'failed_halt') break;
    } catch (error) {
      summary.errors += 1;
      deps.logger.error({
        component: 'dispatcher',
        operation: 'dispatch_job',
        jobId,
        status: 'error',
        errorCode: error instanceof Error ? error.name : 'unknown',
        durationMs: deps.clock.now() - startedAt
      });
      break;
    }
  }
  return summary;
}

function count(summary: DispatchSummary, result: JobResult): void {
  if (result === 'lost') summary.lost += 1;
  else if (result === 'sent') summary.sent += 1;
  else if (result === 'retry_wait') summary.retryWait += 1;
  else if (result === 'failed' || result === 'failed_halt') summary.failed += 1;
  else if (result === 'unknown') summary.unknown += 1;
  else summary.notSent += 1;
}

async function dispatchJob(deps: DispatchDeps, jobId: string, budget: TickBudget): Promise<JobResult> {
  const { repo, clock } = deps;
  const startedAt = clock.now();
  const claimed = await repo.claim(jobId, startedAt, startedAt + LEASE_MS);
  // Another tick or the owner's cancel got there first: nothing to do and nothing to undo.
  if (claimed === null) return 'lost';

  const context: AlertContext = { postTitle: null, channelTitle: null, chatId: null };
  const refuse = (code: string, reason: string) => refused(deps, budget, claimed, startedAt, context, code, reason);

  if (claimed.publicationId === null) return refuse('PUBLICATION_MISSING', 'job_without_publication');
  const target = await repo.loadTarget(claimed.publicationId);
  if (target === null) return refuse('PUBLICATION_MISSING', 'publication_not_found');
  context.channelTitle = target.destinationTitle;
  context.chatId = target.chatId;
  if (!target.destinationEnabled) return refuse('DESTINATION_DISABLED', 'destination_disabled');

  const revision = await deps.posts.findRevision(target.postId, target.postRevision);
  if (revision === null) return refuse('CONTENT_INVALID', 'revision_missing');
  context.postTitle = revision.title;
  const message = formatPublicationText(revision);
  if (!message.ok) return refuse('CONTENT_INVALID', message.reason.toLowerCase());
  const media = revision.media;
  if (media.length > 10 || (media.length > 1 && media.some(({ kind }) => kind === 'animation'))) {
    return refuse('TELEGRAM_MEDIA_UNSUPPORTED', 'unsupported_media_combination');
  }
  if (media.length > 0 && message.text.length > 1024) {
    return refuse('CONTENT_INVALID', 'caption_too_long');
  }

  // The mark must be confirmed before Telegram is called: if the Worker dies after the send, it
  // is the only evidence the post may be out there. Not confirmed: nothing was sent, and reconcile
  // returns the job to retry_wait once the lease is over.
  const now = clock.now();
  const marked = await repo.markSendStarted({
    jobId,
    attempt: claimed.attempt,
    now,
    minLeaseUntil: minLeaseForSend(now)
  });
  if (!marked) {
    log(deps, claimed, startedAt, 'send_not_started', 'LEASE_LOST', 'warn');
    return 'not_sent';
  }

  const outcome = await sendOnce(deps, target.chatId, { ...message, media });
  return resolveSent(deps, budget, claimed, startedAt, context, outcome);
}

// The transport must not throw, but a throw after the mark is exactly the ambiguous case.
async function sendOnce(
  deps: DispatchDeps,
  chatId: string,
  message: { text: string; entities: PostEntity[]; media: readonly import('./ports').PublicationMedia[] }
): Promise<SendOutcome> {
  try {
    return await deps.transport.send({ chatId, text: message.text, entities: message.entities, media: message.media });
  } catch {
    return { kind: 'unknown', reason: 'transport_threw' };
  }
}

// Nothing was sent: the job fails visibly (and with an incident) rather than waiting for ever.
async function refused(
  deps: DispatchDeps,
  budget: TickBudget,
  claimed: ClaimedJob,
  startedAt: number,
  context: AlertContext,
  code: string,
  reason: string
): Promise<JobResult> {
  const finishedAt = deps.clock.now();
  const resolution = baseResolution(claimed, startedAt, finishedAt);
  await write(
    deps,
    budget,
    claimed,
    startedAt,
    {
      ...resolution,
      status: 'failed',
      attemptOutcome: 'skipped',
      errorCode: code,
      incident: failedIncident(deps, code, { attempt: claimed.attempt, reason }),
      auditAction: 'job.failed'
    },
    context
  );
  return 'failed';
}

async function resolveSent(
  deps: DispatchDeps,
  budget: TickBudget,
  claimed: ClaimedJob,
  startedAt: number,
  context: AlertContext,
  outcome: SendOutcome
): Promise<JobResult> {
  const finishedAt = deps.clock.now();
  const base = baseResolution(claimed, startedAt, finishedAt);
  const put = (resolution: JobResolution) => write(deps, budget, claimed, startedAt, resolution, context);

  switch (outcome.kind) {
    case 'sent':
      await put({
        ...base,
        status: 'succeeded',
        attemptOutcome: 'sent',
        externalMessageId: outcome.externalMessageIds[0] ?? null,
        externalMessageIds: outcome.externalMessageIds,
        auditAction: 'job.succeeded'
      });
      return 'sent';

    case 'rate_limited': {
      // Telegram refused: nothing was posted, so a retry is safe, up to the attempt cap.
      if (attemptsExhausted(claimed.attempt)) {
        await put({
          ...base,
          status: 'failed',
          attemptOutcome: 'rate_limited',
          errorCode: 'RETRIES_EXHAUSTED',
          retryAfterSec: outcome.retryAfterSec,
          incident: failedIncident(deps, 'RETRIES_EXHAUSTED', { attempt: claimed.attempt, last: 'RATE_LIMITED' }),
          auditAction: 'job.failed'
        });
        return 'failed';
      }
      await put({
        ...base,
        status: 'retry_wait',
        runAt: retryRunAt({
          now: finishedAt,
          attempt: claimed.attempt,
          retryAfterSec: outcome.retryAfterSec,
          random: deps.random()
        }),
        attemptOutcome: 'rate_limited',
        errorCode: 'RATE_LIMITED',
        retryAfterSec: outcome.retryAfterSec,
        auditAction: 'job.retry_wait'
      });
      return 'retry_wait';
    }

    case 'rejected':
      await put({
        ...base,
        status: 'failed',
        attemptOutcome: 'rejected',
        errorCode: outcome.code,
        incident: failedIncident(deps, outcome.code, { attempt: claimed.attempt }),
        auditAction: 'job.failed'
      });
      return outcome.code === 'BOT_UNAUTHORIZED' ? 'failed_halt' : 'failed';

    case 'unknown':
      // It may have been posted: a human reconciles it, it is never retried automatically.
      await put({
        ...base,
        status: 'unknown',
        attemptOutcome: 'unknown',
        errorCode: 'SEND_UNCONFIRMED',
        incident: {
          id: deps.newId(),
          kind: 'publish_unknown',
          code: 'SEND_UNCONFIRMED',
          details: { attempt: claimed.attempt, reason: outcome.reason }
        },
        auditAction: 'job.unknown'
      });
      return 'unknown';

    default: {
      const unreachable: never = outcome;
      throw new Error(`Unhandled send outcome: ${JSON.stringify(unreachable)}`);
    }
  }
}

function baseResolution(claimed: ClaimedJob, startedAt: number, finishedAt: number): JobResolution {
  return {
    jobId: claimed.jobId,
    publicationId: claimed.publicationId,
    attempt: claimed.attempt,
    startedAt,
    finishedAt,
    status: 'failed',
    attemptOutcome: 'skipped',
    errorCode: null,
    retryAfterSec: null,
    externalMessageId: null,
    incident: null,
    auditAction: 'job.failed'
  };
}

function failedIncident(
  deps: DispatchDeps,
  code: string,
  details: Record<string, string | number>
): NonNullable<JobResolution['incident']> {
  return { id: deps.newId(), kind: 'publish_failed', code, details };
}

// If the first outcome write fails it is not simply repeated: the batch is atomic, but its response
// may have been lost after it committed. So the state is read first; only a write that is not in
// place is repeated (guarded, so a repeat cannot duplicate), which saves a confirmed send from
// degrading to `unknown` at reconcile. One retry per tick; the next failure ends the tick.
async function write(
  deps: DispatchDeps,
  budget: TickBudget,
  claimed: ClaimedJob,
  startedAt: number,
  resolution: JobResolution,
  context: AlertContext
): Promise<void> {
  let applied: boolean;
  try {
    applied = await deps.repo.resolve(resolution);
  } catch (error) {
    if (budget.writeRetries <= 0) throw error;
    budget.writeRetries -= 1;
    applied = (await deps.repo.outcomeInPlace(resolution)) || (await deps.repo.resolve(resolution));
  }
  // Not applied means reconcile resolved the job first (the lease ran out mid-send): its state stands.
  if (applied) {
    log(deps, claimed, startedAt, resolution.status, resolution.errorCode ?? undefined);
    // Only a write that took effect raised its incident: a lost one belongs to reconcile, which reports it.
    if (resolution.incident !== null) {
      budget.raised.push({
        id: resolution.incident.id,
        kind: resolution.incident.kind,
        code: resolution.incident.code,
        publicationId: resolution.publicationId,
        postTitle: context.postTitle,
        channelTitle: context.channelTitle
      });
    }
    if (resolution.status === 'succeeded' && resolution.publicationId !== null) {
      budget.delivered.push({
        publicationId: resolution.publicationId,
        postTitle: context.postTitle,
        channelTitle: context.channelTitle,
        chatId: context.chatId,
        externalMessageId: resolution.externalMessageId ?? null
      });
    }
  } else log(deps, claimed, startedAt, resolution.status, 'OUTCOME_NOT_APPLIED', 'warn');
}

function log(
  deps: DispatchDeps,
  claimed: ClaimedJob,
  startedAt: number,
  status: string,
  errorCode?: string,
  level: 'info' | 'warn' = 'info'
): void {
  deps.logger[level]({
    component: 'dispatcher',
    operation: 'job',
    jobId: claimed.jobId,
    attempt: claimed.attempt,
    status,
    ...(errorCode === undefined ? {} : { errorCode }),
    durationMs: deps.clock.now() - startedAt
  });
}
