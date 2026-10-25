import type { OwnerOperationsSettingsDto } from '@alexeev/contracts';
import type { TelegramOwnerMessageApi } from '../../integrations/telegram/telegram-api';
import {
  buildEventDraft,
  changedEntities,
  DOTA_SOURCE_KEYS,
  DotaPatchDetailError,
  DotaWatchError,
  type ChangedEntity,
  type DotaPatchInspection,
  type DotaWatcherRepository
} from '../../modules/dota';
import { createPost, type IdempotencyGate, type PostRepository } from '../../modules/content';
import type { QueryBudget } from '../../platform/d1-budget';
import type { Logger } from '../../platform/logging/logger';
import { AppError } from '../../shared/app-error';
import { createTelegramCaller } from '../bot/telegram-call';
import type { PublishButton } from '../bot/publish-actions';
import { publishKeyboard } from '../bot/publish-keyboard';
import { formatDotaDraftAlert, formatDotaIncidentAlert } from '../notifications/dota-alert';
import type { AiJob } from '../bot/ai-job';
import { requestSourceEventDraft } from './source-event-ai-draft';

// Keep each tick small enough to leave room for the existing publishing dispatch's 50-statement budget.
const DOTA_DRAFT_BATCH_LIMIT = 2;
const DOTA_PATCH_ANALYSIS_LEASE_MS = 60_000;
const DOTA_NOTICE_TIMEOUT_MS = 5_000;
// Free plan: 50 subrequests per invocation shared with the whole tick. The Steam and patch-list fetches.
const DOTA_SYNC_SUBREQUESTS = 2;
// Patch details plus the hero and item name lists.
const DOTA_PATCH_INSPECT_SUBREQUESTS = 3;
// Worst case of one draft (a patch: reserve, post lookup, create 5, watches, details fetches 3, analysis save and
// resolve) and of one owner notice (claim, post and media lookups, channels, three for the button tokens, send).
// Below it the rest waits for the next tick: nothing is lost, every step is recoverable.
const DOTA_DRAFT_MIN_BUDGET = 13;
const DOTA_ALERT_MIN_BUDGET = 9;
// What the tick still spends after this workflow: watchlist matching and alerts, the automation run record, the
// heartbeat. Pinned by the tick budget test in tests/integration/source-events.test.ts.
const DOTA_TAIL_RESERVE = 12;
// Preferences, app origin and the alert list, read before the first notice.
const DOTA_ALERT_SETUP = 3;
// One AI draft request: the claim and the queue send (the list and the app origin are the setup).
const DOTA_AI_REQUEST_COST = 2;
const DOTA_AI_SETUP = 2;

export interface DotaWorkflowSummary {
  feedsFetched: number;
  itemsInserted: number;
  draftsCreated: number;
  draftAlertsSent: number;
  aiDraftsRequested: number;
  sourceAlertsSent: number;
  sourceFailures: number;
}

export async function processDotaUpdates(deps: {
  sync: (input: { detectedAt: number }) => Promise<{ inserted: number; fetched: number }>;
  inspectPatch?: (version: string) => Promise<DotaPatchInspection>;
  repo: DotaWatcherRepository;
  posts: PostRepository;
  idempotency: IdempotencyGate;
  actor: string;
  now: () => number;
  newId: () => string;
  messenger: TelegramOwnerMessageApi | null;
  ownerChatId: string | null;
  readAppOrigin: () => Promise<string | null>;
  readNotificationPreferences?: () => Promise<OwnerOperationsSettingsDto['notifications']>;
  /** Active watches as `watchKey`s: a patch draft lists watched heroes and items first. */
  watchedKeys: () => Promise<Set<string>>;
  /** The «Опубликовать сейчас» buttons for a draft; empty when there is no channel. Never throws. */
  publishButtons: (post: { id: string; revision: number }) => Promise<PublishButton[]>;
  /** Queue AI_JOBS: a Steam announcement event is drafted by the AI writer. Without it such events wait. */
  enqueueAiJob?: (job: AiJob) => Promise<void>;
  budget: QueryBudget;
  logger: Logger;
  timeoutMs?: number;
}): Promise<DotaWorkflowSummary> {
  const summary: DotaWorkflowSummary = {
    feedsFetched: 0,
    itemsInserted: 0,
    draftsCreated: 0,
    draftAlertsSent: 0,
    aiDraftsRequested: 0,
    sourceAlertsSent: 0,
    sourceFailures: 0
  };
  try {
    deps.budget.charge(DOTA_SYNC_SUBREQUESTS);
    const syncSummary = await deps.sync({ detectedAt: deps.now() });
    summary.feedsFetched = syncSummary.fetched;
    summary.itemsInserted = syncSummary.inserted;
    summary.sourceFailures += Math.max(0, DOTA_SOURCE_KEYS.length - syncSummary.fetched);
    if (syncSummary.fetched < DOTA_SOURCE_KEYS.length) {
      deps.logger.warn({
        component: 'dota',
        operation: 'source_sync',
        status: 'partial',
        errorCode: 'DOTA_SOURCE_PARTIAL_FAILURE'
      });
    }
  } catch (error) {
    if (!(error instanceof DotaWatchError)) throw error;
    summary.sourceFailures = 1;
    await deps.repo.recordSourceFailure({
      sourceKey: error.sourceKey,
      code: error.code,
      httpStatus: error.httpStatus,
      detail: error.detail,
      detectedAt: deps.now(),
      id: deps.newId()
    });
    deps.logger.warn({
      component: 'dota',
      operation: 'source_sync',
      status: 'error',
      errorCode: `${error.code}_${error.sourceKey}`
    });
  }

  const draftWork = await deps.repo.listDraftWork(DOTA_DRAFT_BATCH_LIMIT);
  let watched: Set<string> | null = null;
  for (const source of draftWork) {
    if (deps.budget.remaining() < DOTA_DRAFT_MIN_BUDGET + DOTA_TAIL_RESERVE) break;
    const reservedId =
      source.draftPostId ??
      (await deps.repo.reserveDraft({
        sourceKey: source.sourceKey,
        externalId: source.externalId,
        postId: deps.newId()
      }));
    if (reservedId === null) continue;

    const existing = await deps.posts.findById(reservedId);
    if (existing !== null) continue;

    let entities: ChangedEntity[] = [];
    if (source.sourceKey === 'patch_notes' && deps.inspectPatch !== undefined) {
      try {
        deps.budget.charge(DOTA_PATCH_INSPECT_SUBREQUESTS);
        const inspection = await deps.inspectPatch(source.externalId);
        entities = changedEntities(inspection.analysis.facts);
        const analysisSaved = await deps.repo.savePatchAnalysis({
          externalId: source.externalId,
          parseStatus: inspection.analysis.status,
          facts: inspection.analysis.facts,
          parsedAt: deps.now()
        });
        if (analysisSaved)
          await deps.repo.resolvePatchDetailFailures({ externalId: source.externalId, detectedAt: deps.now() });
      } catch (error) {
        if (!(error instanceof DotaPatchDetailError)) throw error;
        const analysisSaved = await deps.repo.savePatchAnalysis({
          externalId: source.externalId,
          parseStatus: 'unavailable',
          facts: [],
          parsedAt: deps.now()
        });
        if (analysisSaved) {
          summary.sourceFailures += 1;
          await deps.repo.recordSourceFailure({
            sourceKey: error.sourceKey,
            code: error.code,
            externalId: error.externalId,
            detectedAt: deps.now(),
            id: deps.newId()
          });
          deps.logger.warn({
            component: 'dota',
            operation: 'patch_summary',
            status: 'omitted',
            errorCode: error.code
          });
        }
        continue;
      }
    }
    if (source.eventType === 'patch') watched ??= await deps.watchedKeys();
    const input = buildEventDraft(
      {
        type: source.eventType,
        externalId: source.externalId,
        title: source.title,
        excerpt: source.excerpt,
        sourceUrl: source.sourceUrl
      },
      entities,
      watched ?? new Set()
    );
    try {
      await createPost(
        { repo: deps.posts, idempotency: deps.idempotency, now: deps.now(), newId: () => reservedId },
        {
          actor: deps.actor,
          idempotencyKey: `dota:${source.sourceKey}:${source.externalId}:${reservedId}`,
          input
        }
      );
      summary.draftsCreated += 1;
    } catch (error) {
      // A live idempotency lease means a concurrent tick is completing the same reserved post.
      // Any other error is visible and the durable reservation lets a later tick recover safely.
      deps.logger.warn({
        component: 'dota',
        operation: 'draft_create',
        status: 'error',
        errorCode: error instanceof AppError ? error.code : 'UNEXPECTED_ERROR'
      });
      if (!(error instanceof AppError && error.code === 'CONFLICT' && error.details?.reason === 'IN_FLIGHT'))
        throw error;
    }
  }

  if (deps.inspectPatch !== undefined && deps.budget.remaining() >= DOTA_DRAFT_MIN_BUDGET + DOTA_TAIL_RESERVE) {
    const claimToken = deps.newId();
    const pendingAnalyses = await deps.repo.claimPendingPatchAnalyses({
      claimToken,
      now: deps.now(),
      leaseUntil: deps.now() + DOTA_PATCH_ANALYSIS_LEASE_MS,
      limit: DOTA_DRAFT_BATCH_LIMIT
    });
    for (const externalId of pendingAnalyses) {
      try {
        deps.budget.charge(DOTA_PATCH_INSPECT_SUBREQUESTS);
        const inspection = await deps.inspectPatch(externalId);
        const analysisSaved = await deps.repo.savePatchAnalysis({
          externalId,
          claimToken,
          parseStatus: inspection.analysis.status,
          facts: inspection.analysis.facts,
          parsedAt: deps.now()
        });
        if (analysisSaved) await deps.repo.resolvePatchDetailFailures({ externalId, detectedAt: deps.now() });
      } catch (error) {
        if (!(error instanceof DotaPatchDetailError)) throw error;
        const analysisSaved = await deps.repo.savePatchAnalysis({
          externalId,
          claimToken,
          parseStatus: 'unavailable',
          facts: [],
          parsedAt: deps.now()
        });
        if (analysisSaved) {
          summary.sourceFailures += 1;
          await deps.repo.recordSourceFailure({
            sourceKey: error.sourceKey,
            code: error.code,
            externalId: error.externalId,
            detectedAt: deps.now(),
            id: deps.newId()
          });
          deps.logger.warn({
            component: 'dota',
            operation: 'patch_analysis',
            status: 'omitted',
            errorCode: error.code
          });
        }
      }
    }
  }

  summary.aiDraftsRequested = await requestAiDrafts(deps);
  summary.draftAlertsSent = await alertDrafts(deps);
  summary.sourceAlertsSent = await alertSourceIncidents(deps);
  return summary;
}

const ALL_NOTIFICATIONS_ON: OwnerOperationsSettingsDto['notifications'] = {
  warningsEnabled: true,
  publicationAlerts: true,
  sourceAlerts: true,
  automationAlerts: true,
  recoveryAlerts: true,
  dotaWatchlistAlerts: true,
  scheduleNotices: true,
  sentNotices: true,
  dailyReport: false,
  dailyReportHour: 9,
  draftOffers: true,
  weeklyReport: true,
  contentAlerts: true,
  aiReviews: true,
  scriptPrompts: true,
  aiLearning: true
};

async function readPreferences(
  deps: Parameters<typeof processDotaUpdates>[0],
  operation: string
): Promise<OwnerOperationsSettingsDto['notifications'] | null> {
  if (deps.readNotificationPreferences === undefined) return ALL_NOTIFICATIONS_ON;
  try {
    return await deps.readNotificationPreferences();
  } catch {
    logSkipped(deps, operation, 'SETTINGS_UNAVAILABLE');
    return null;
  }
}

// One notice per event: the claim is a conditional UPDATE, so a repeated tick or a concurrent one finds it
// taken. With the sourceAlerts preference off the claim is still consumed (a quiet event stays quiet).
async function alertDrafts(deps: Parameters<typeof processDotaUpdates>[0]): Promise<number> {
  if (deps.budget.remaining() < DOTA_ALERT_MIN_BUDGET + DOTA_TAIL_RESERVE + DOTA_ALERT_SETUP) return 0;
  const sources = await deps.repo.listOwnerAlertWork(DOTA_DRAFT_BATCH_LIMIT);
  if (sources.length === 0) return 0;
  const notifications = await readPreferences(deps, 'dota_draft_alert');
  if (notifications === null) return 0;
  const ready = await notificationPrerequisites(deps);
  if (ready === null) {
    logSkipped(deps, 'draft_alert', missingPrerequisite(deps));
    return 0;
  }
  let sent = 0;
  const call = createTelegramCaller({ logger: deps.logger, timeoutMs: deps.timeoutMs ?? DOTA_NOTICE_TIMEOUT_MS });
  for (const source of sources) {
    const draftPostId = source.draftPostId;
    if (draftPostId === null) continue;
    if (deps.budget.remaining() < DOTA_ALERT_MIN_BUDGET + DOTA_TAIL_RESERVE) break;
    const claimed = await deps.repo.claimDraftOwnerAlert({
      sourceKey: source.sourceKey,
      externalId: source.externalId,
      claimedAt: deps.now()
    });
    if (!claimed) continue;
    // «Новость пришла» has its own switch (25.10.2026); sourceAlerts keeps the sources' failures.
    if (!notifications.draftOffers) {
      logSkipped(deps, 'dota_draft_alert', 'ALERT_CATEGORY_DISABLED');
      continue;
    }
    try {
      const post = await deps.posts.findById(draftPostId);
      if (post === null) continue;
      const buttons =
        post.status === 'draft' ? await deps.publishButtons({ id: post.id, revision: post.revision }) : [];
      const markup = publishKeyboard({ appOrigin: ready.origin, postId: post.id, buttons });
      if (markup === undefined) continue;
      deps.budget.charge(1);
      await call.act('dota_draft_alert.send', (signal) =>
        ready.messenger.sendMessageWithKeyboard(
          ready.ownerChatId,
          { html: formatDotaDraftAlert(source), markup },
          signal
        )
      );
      sent += 1;
    } catch (error) {
      deps.logger.warn({
        component: 'owner_notice',
        operation: 'dota_draft_alert',
        status: 'failed',
        errorCode: error instanceof AppError ? error.code : 'UNEXPECTED_ERROR'
      });
    }
  }
  return sent;
}

// A Steam announcement event goes to the AI writer, once per detection (the claim is a conditional UPDATE). A
// queue refusal gives the claim back for the next tick; Telegram is only reached by the consumer.
async function requestAiDrafts(deps: Parameters<typeof processDotaUpdates>[0]): Promise<number> {
  if (deps.budget.remaining() < DOTA_AI_SETUP + DOTA_AI_REQUEST_COST + DOTA_TAIL_RESERVE) return 0;
  const enqueue = deps.enqueueAiJob;
  const sources = await deps.repo.listAiDraftWork(DOTA_DRAFT_BATCH_LIMIT);
  if (sources.length === 0) return 0;
  const ready = enqueue === undefined ? null : await notificationPrerequisites(deps);
  if (enqueue === undefined || ready === null) {
    logSkipped(deps, 'dota_ai_draft', enqueue === undefined ? 'AI_QUEUE_MISSING' : missingPrerequisite(deps));
    return 0;
  }
  let requested = 0;
  for (const source of sources) {
    if (deps.budget.remaining() < DOTA_AI_REQUEST_COST + DOTA_TAIL_RESERVE) break;
    deps.budget.charge(1);
    try {
      const claimed = await requestSourceEventDraft(
        { repo: deps.repo, enqueue, newId: deps.newId, now: deps.now },
        { externalId: source.externalId, chatId: Number(ready.ownerChatId), appOrigin: ready.origin, replay: false }
      );
      if (claimed) requested += 1;
    } catch (error) {
      deps.logger.warn({
        component: 'dota',
        operation: 'ai_draft_request',
        status: 'failed',
        errorCode: error instanceof AppError ? error.code : 'UNEXPECTED_ERROR'
      });
    }
  }
  return requested;
}

async function alertSourceIncidents(deps: Parameters<typeof processDotaUpdates>[0]): Promise<number> {
  // Same rule as the draft notices: start only when the whole alert (read, claim, send, mark) still fits and
  // the tail reserve stays free; otherwise the incident waits for the next tick (it is claimed only once).
  if (deps.budget.remaining() < DOTA_ALERT_MIN_BUDGET + DOTA_TAIL_RESERVE + DOTA_ALERT_SETUP) return 0;
  const incidents = await deps.repo.listSourceIncidentAlerts(2);
  if (incidents.length === 0) return 0;
  const notifications = await readPreferences(deps, 'dota_source_alert');
  if (notifications === null) return 0;
  const ready = await notificationPrerequisites(deps);
  if (ready === null) {
    if (incidents.length > 0) logSkipped(deps, 'dota_source_alert', missingPrerequisite(deps));
    return 0;
  }
  let sent = 0;
  const call = createTelegramCaller({ logger: deps.logger, timeoutMs: deps.timeoutMs ?? DOTA_NOTICE_TIMEOUT_MS });
  for (const incident of incidents) {
    const claim = await deps.repo.claimSourceIncidentAlert({ id: incident.id, claimedAt: deps.now() });
    if (claim === null) continue;
    const recovery = claim.resolvedAt !== null;
    if (!notifications.sourceAlerts || (recovery ? !notifications.recoveryAlerts : !notifications.warningsEnabled)) {
      logSkipped(deps, recovery ? 'dota_source_recovery' : 'dota_source_alert', 'ALERT_CATEGORY_DISABLED');
      continue;
    }
    try {
      await call.act('dota_source_alert.send', (signal) =>
        ready.messenger.sendMessageWithWebAppButton(
          ready.ownerChatId,
          formatDotaIncidentAlert({ ...incident, resolvedAt: claim.resolvedAt }, ready.origin),
          signal
        )
      );
      sent += 1;
    } catch (error) {
      deps.logger.warn({
        component: 'owner_notice',
        operation: 'dota_source_alert',
        status: 'failed',
        errorCode: error instanceof AppError ? error.code : 'UNEXPECTED_ERROR'
      });
    }
  }
  return sent;
}

async function notificationPrerequisites(
  deps: Parameters<typeof processDotaUpdates>[0]
): Promise<{ messenger: TelegramOwnerMessageApi; ownerChatId: string; origin: string } | null> {
  if (deps.messenger === null || deps.ownerChatId === null) return null;
  const origin = await deps.readAppOrigin();
  return origin === null ? null : { messenger: deps.messenger, ownerChatId: deps.ownerChatId, origin };
}

function missingPrerequisite(deps: Parameters<typeof processDotaUpdates>[0]): string {
  if (deps.messenger === null) return 'BOT_TOKEN_MISSING';
  if (deps.ownerChatId === null) return 'OWNER_ID_MISSING';
  return 'APP_ORIGIN_UNKNOWN';
}

function logSkipped(deps: Parameters<typeof processDotaUpdates>[0], operation: string, errorCode: string): void {
  deps.logger.info({ component: 'owner_notice', operation, status: 'skipped', errorCode });
}
