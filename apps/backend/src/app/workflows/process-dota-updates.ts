import type { CreatePostInput } from '@alexeev/contracts';
import type { TelegramOwnerMessageApi } from '../../integrations/telegram/telegram-api';
import {
  DotaPatchDetailError,
  DotaWatchError,
  type DotaDraftSource,
  type DotaPatchSummary,
  type DotaWatcherRepository
} from '../../modules/dota';
import { createPost, type IdempotencyGate, type PostRepository } from '../../modules/content';
import type { Logger } from '../../platform/logging/logger';
import { AppError } from '../../shared/app-error';
import { createTelegramCaller } from '../bot/telegram-call';
import { formatDotaDraftAlert, formatDotaIncidentAlert } from '../notifications/dota-alert';

// Keep each tick small enough to leave room for the existing publishing dispatch's 50-statement budget.
export const DOTA_DRAFT_BATCH_LIMIT = 2;
export const DOTA_NOTICE_TIMEOUT_MS = 5_000;

export interface DotaWorkflowSummary {
  feedsFetched: number;
  itemsInserted: number;
  draftsCreated: number;
  draftAlertsSent: number;
  sourceAlertsSent: number;
  sourceFailures: number;
}

export async function processDotaUpdates(deps: {
  sync: (input: { detectedAt: number }) => Promise<{ inserted: number; fetched: number }>;
  summarizePatch: (version: string) => Promise<DotaPatchSummary | null>;
  repo: DotaWatcherRepository;
  posts: PostRepository;
  idempotency: IdempotencyGate;
  actor: string;
  now: () => number;
  newId: () => string;
  messenger: TelegramOwnerMessageApi | null;
  ownerChatId: string | null;
  readAppOrigin: () => Promise<string | null>;
  logger: Logger;
  timeoutMs?: number;
}): Promise<DotaWorkflowSummary> {
  const summary: DotaWorkflowSummary = {
    feedsFetched: 0,
    itemsInserted: 0,
    draftsCreated: 0,
    draftAlertsSent: 0,
    sourceAlertsSent: 0,
    sourceFailures: 0
  };
  try {
    const syncSummary = await deps.sync({ detectedAt: deps.now() });
    summary.feedsFetched = syncSummary.fetched;
    summary.itemsInserted = syncSummary.inserted;
  } catch (error) {
    if (!(error instanceof DotaWatchError)) throw error;
    summary.sourceFailures = 1;
    await deps.repo.recordSourceFailure({
      sourceKey: error.sourceKey,
      code: error.code,
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
  for (const source of draftWork) {
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

    let patchSummary: DotaPatchSummary | null = null;
    if (source.sourceKey === 'patch_notes') {
      try {
        patchSummary = await deps.summarizePatch(source.externalId);
        await deps.repo.resolvePatchDetailFailures({ externalId: source.externalId, detectedAt: deps.now() });
      } catch (error) {
        if (!(error instanceof DotaPatchDetailError)) throw error;
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
        continue;
      }
    }
    const input = draftInput(source, patchSummary);
    try {
      await createPost(
        { repo: deps.posts, idempotency: deps.idempotency, now: deps.now(), newId: () => reservedId },
        {
          actor: deps.actor,
          idempotencyKey: `dota:${source.sourceKey}:${source.externalId}`,
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

  summary.draftAlertsSent = await alertDrafts(deps);
  summary.sourceAlertsSent = await alertSourceIncidents(deps);
  return summary;
}

function draftInput(source: DotaDraftSource, patchSummary: DotaPatchSummary | null): CreatePostInput {
  const publishedAt = new Date(source.publishedAt).toISOString();
  const title = source.title.length <= 200 ? source.title : 'Обновление Dota';
  const summary =
    source.sourceKey !== 'patch_notes'
      ? ''
      : patchSummary === null
        ? '\n\nАвтоматическая сводка не сформирована: проверьте изменения вручную по официальному источнику.'
        : `\n\nПредварительная сводка по официальным заметкам — проверьте перед публикацией:\n${patchSummary.themes
            .map((theme) => `— ${theme.category} — ${theme.name}: ${theme.changes.join('; ')}`)
            .join('\n')}`;
  const body = `${source.title}${summary}\n\nОпубликовано (UTC): ${publishedAt}\nОфициальный источник: ${source.sourceUrl}`;
  return { title, body, entities: [] };
}

async function alertDrafts(deps: Parameters<typeof processDotaUpdates>[0]): Promise<number> {
  const sources = await deps.repo.listOwnerAlertWork(DOTA_DRAFT_BATCH_LIMIT);
  if (sources.length === 0) return 0;
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
    const claimed = await deps.repo.claimDraftOwnerAlert({
      sourceKey: source.sourceKey,
      externalId: source.externalId,
      claimedAt: deps.now()
    });
    if (!claimed) continue;
    try {
      const notice = formatDotaDraftAlert({ ...source, draftPostId }, ready.origin);
      await call.act('dota_draft_alert.send', (signal) =>
        ready.messenger.sendMessageWithWebAppButton(ready.ownerChatId, notice, signal)
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

async function alertSourceIncidents(deps: Parameters<typeof processDotaUpdates>[0]): Promise<number> {
  const incidents = await deps.repo.listSourceIncidentAlerts(2);
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
