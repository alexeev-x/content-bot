import { Api } from 'grammy';
import { aiJobSchema } from './bot/ai-job';
import { runAiJob } from './bot/ai-writer';
import { createWriterDeps } from './bot/writer-deps';
import { runDailyReview } from './workflows/daily-review';
import { runHypothesesReview } from './workflows/hypotheses';
import { sourceEventWriter } from './workflows/source-event-ai-draft';
import { attachSourceEventImages, type SourceMediaDeps } from './workflows/source-event-media';
import { planEventSeries, writeSeriesPost } from './workflows/source-event-series';
import { skipDullHotfix } from './workflows/source-event-hotfix';
import { patchPictureFor } from './workflows/patch-picture';
import { PHOTO_MEDIA_MAX_BYTES } from '@alexeev/contracts';
import { uploadPostMedia } from '../modules/content';
import { AppError } from '../shared/app-error';
import { runStyleLessons } from './workflows/style-lessons';
import {
  type AutopublishOutcome,
  autopublishSourceEvent,
  publishQueuedPatchPost
} from './workflows/autopublish-source-event';
import { isHotfixTitle, patchVersionOf } from '../modules/dota';
import { runSeriesPublishStep } from './workflows/autopublish-series';
import { runTreasureWatch } from './workflows/treasure-watch';
import { runPictureTrial } from './workflows/picture-trial';
import { getOwnerOperationsSettings } from '../modules/settings';
import { escapeHtml } from './notifications/notice-template';
import type { AiJob, WriterJob } from './bot/ai-job';
import type { Container } from './container';

// Consumer of Queue AI_JOBS (docs/backend/bot.md «AI writer»): one model call per message, with the 15 minutes
// of wall time a consumer has instead of the 30 s left to a webhook's `waitUntil` (owner, 19.10.2026: text
// quality first). The queue never retries (`max_retries: 0`): a model call is paid, and every failure is shown
// in the job's own «Пишу…» message instead.

/** Same budget as a webhook's Bot API calls: a hung Telegram must not hold the consumer. */
const TELEGRAM_TIMEOUT_SECONDS = 10;
const TELEGRAM_FILE_TIMEOUT_MS = 30_000;

/**
 * An image Valve's CDN refuses to the Worker, fetched by Telegram: the bot sends it to the owner's chat silently by
 * its address, takes Telegram's copy (JPEG) and deletes the message at once. The file URL holds the bot token, so it
 * is never logged or put in an error.
 */
async function fetchViaTelegram(token: string, chatId: number, url: string): Promise<Uint8Array | null> {
  const api = new Api(token, { timeoutSeconds: TELEGRAM_TIMEOUT_SECONDS });
  const message = await api.sendPhoto(chatId, url, { disable_notification: true });
  await api.deleteMessage(chatId, message.message_id).catch(() => undefined);
  const photo = message.photo?.at(-1);
  if (photo === undefined) return null;
  const file = await api.getFile(photo.file_id);
  if (file.file_path === undefined || (file.file_size ?? 0) > PHOTO_MEDIA_MAX_BYTES) return null;
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, {
    signal: AbortSignal.timeout(TELEGRAM_FILE_TIMEOUT_MS)
  }).catch(() => null);
  if (response === null || !response.ok) {
    await response?.body?.cancel().catch(() => undefined);
    return null;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.byteLength > PHOTO_MEDIA_MAX_BYTES ? null : bytes;
}

/** The automatic publishing is on with a channel picked. */
async function autopublishOn(container: Container, requestId: string): Promise<boolean> {
  const { autopublish } = await getOwnerOperationsSettings({
    repo: container.settings,
    logger: container.logger,
    requestId
  });
  return autopublish.enabled && autopublish.destinationId !== null;
}

/** A patch picture that three tries could not draw right (plan 22.10.2026): the post goes without it. */
const PICTURE_FAILED_TEXT = 'Картинка к патчу не получилась, пост без неё.';

const EVENT_LABEL = { treasure: 'Сокровищница', news: 'Новость', patch: 'Патч' } as const;
const eventWritingText = (type: keyof typeof EVENT_LABEL, title: string) =>
  `${EVENT_LABEL[type]} в Steam: ${title}
Пишу пост…`;

/**
 * How an event post's images are fetched and attached: as the bot's own files (out of «Медиа»). With `patch`, a patch
 * announcement gets its drawn picture instead.
 */
function sourceMediaDeps(
  container: Container,
  token: string,
  chatId: number,
  patch?: { requestId: string; onError: (error: unknown) => void }
): SourceMediaDeps {
  const storage = container.mediaStorage;
  if (storage === undefined) throw new AppError('UNAVAILABLE', 'Media storage is not configured');
  return {
    repo: container.dotaRepository,
    postState: async (id) => {
      const state = await container.postMedia.findPostState(id);
      return state === null ? null : { revision: state.revision, mediaCount: state.media.length };
    },
    upload: (command) =>
      uploadPostMedia(
        { repo: container.postMedia, storage, now: container.clock.now(), newId: container.newId },
        { ...command, actor: container.ownerChatId ?? 'system', hidden: true }
      ),
    // Only a stable code with the CDN host and status, never a URL.
    onSkip: (reason) =>
      container.logger.warn({
        component: 'source_media',
        operation: 'attach',
        status: 'skipped',
        errorCode: reason
      }),
    ...(token === '' ? {} : { viaTelegram: (url: string) => fetchViaTelegram(token, chatId, url) }),
    ...(patch === undefined ? {} : { patchPicture: patchPictureFor(container, patch.requestId, patch.onError) })
  };
}

/** Attaches an approved event post's images once, then tells the owner how many arrived. Never throws. */
async function runSourceMediaJob(
  job: Extract<AiJob, { kind: 'source_media' }>,
  container: Container,
  token: string,
  requestId: string,
  onError: (error: unknown) => void
): Promise<void> {
  let text: string;
  try {
    if (!(await container.aiWriter.claimJob(job.id, container.clock.now()))) return;
    const { attached, found, pictureFailed } = await attachSourceEventImages(
      sourceMediaDeps(container, token, job.chatId, { requestId, onError }),
      job
    );
    await container.aiWriter.finishJob(job.id, container.clock.now());
    // Only what needs the owner's hand reaches the bot (owner, 22.10.2026: «эту инфу не надо мне в тг»).
    if (pictureFailed === true) text = PICTURE_FAILED_TEXT;
    else if (attached === found) return;
    else text = `Прикреплено картинок из анонса: ${attached} из ${found}. Остальные добавьте в студии.`;
  } catch (error) {
    onError(error);
    text = 'Не удалось прикрепить картинки из анонса. Добавьте их в студии.';
  }
  if (token === '') return;
  await new Api(token, { timeoutSeconds: TELEGRAM_TIMEOUT_SECONDS })
    .sendMessage(job.chatId, text)
    .catch((error: unknown) => onError(error));
}

/** A patch announcement (not a treasure's follow-up): its post gets a drawn picture. */
async function isPatchEvent(container: Container, externalId: string, followUp: boolean): Promise<boolean> {
  if (followUp) return false;
  const source = await container.dotaRepository.findSteamAnnouncement(externalId);
  return source !== null && (patchVersionOf(source.title) !== null || isHotfixTitle(source.title));
}

/** The owner's short note of what the automatic publishing did; null when it did nothing. */
function autopublishNote(outcome: AutopublishOutcome, appOrigin: string, externalId: string): string | null {
  if (outcome.kind === 'skipped') return null;
  const title = escapeHtml(outcome.title);
  if (outcome.kind === 'queued')
    return `Пост о патче одобрен${title === '' ? '' : `: «${title}»`}. Рисую картинку и опубликую без вас.`;
  if (outcome.kind === 'published') {
    const link = escapeHtml(
      outcome.publicationId === null
        ? `${appOrigin}/publications`
        : `${appOrigin}/publications?id=${encodeURIComponent(outcome.publicationId)}`
    );
    return `Опубликовано без вас: «${title}».${outcome.pictureFailed === true ? ` ${PICTURE_FAILED_TEXT}` : ''} <a href="${link}">Открыть</a>`;
  }
  const link = escapeHtml(
    outcome.postId === null
      ? `${appOrigin}/sources?open=${encodeURIComponent(`steam_news:${externalId}`)}`
      : `${appOrigin}/posts/${encodeURIComponent(outcome.postId)}`
  );
  const why = outcome.reason === 'no_images' ? 'картинки из анонса не загрузились' : 'не получилось опубликовать';
  return `Не опубликовано без вас (${why})${title === '' ? '' : `: «${title}»`}. Пост ждёт в студии. <a href="${link}">Открыть</a>`;
}

/** Draws the approved patch post's picture and publishes it once, then tells the owner quietly. Never throws. */
async function runPatchPublishJob(
  job: Extract<AiJob, { kind: 'patch_publish' }>,
  container: Container,
  token: string,
  requestId: string,
  onError: (error: unknown) => void
): Promise<void> {
  let text: string | null;
  try {
    if (!(await container.aiWriter.claimJob(job.id, container.clock.now()))) return;
    const outcome = await publishQueuedPatchPost(
      container,
      sourceMediaDeps(container, token, job.chatId, { requestId, onError }),
      {
        postId: job.postId,
        externalId: job.externalId,
        requestId
      }
    );
    container.logger.info({ component: 'autopublish', operation: 'patch_publish', requestId, status: outcome.kind });
    await container.aiWriter.finishJob(job.id, container.clock.now());
    text = autopublishNote(outcome, job.appOrigin, job.externalId);
  } catch (error) {
    onError(error);
    const link = escapeHtml(`${job.appOrigin}/posts/${encodeURIComponent(job.postId)}`);
    text = `Не опубликовано без вас (не получилось опубликовать). Пост о патче ждёт в студии. <a href="${link}">Открыть</a>`;
  }
  if (token === '' || text === null) return;
  // The owner may be asleep (owner, 22.10.2026): no sound.
  await new Api(token, { timeoutSeconds: TELEGRAM_TIMEOUT_SECONDS })
    .sendMessage(job.chatId, text, { parse_mode: 'HTML', disable_notification: true })
    .catch((error: unknown) => onError(error));
}

export async function handleAiQueue(batch: MessageBatch<unknown>, container: Container, token: string) {
  const { logger } = container;
  for (const message of batch.messages) {
    const requestId = `queue:${message.id}`;
    const parsed = aiJobSchema.safeParse(message.body);
    if (!parsed.success) {
      // Only the code: the body holds the owner's words.
      logger.error({ component: 'ai_queue', operation: 'parse', requestId, errorCode: 'AI_JOB_INVALID' });
      message.ack();
      continue;
    }
    const job = parsed.data;
    const onError = (error: unknown) =>
      logger.error({
        component: 'ai_queue',
        operation: job.kind,
        requestId,
        errorCode: error instanceof Error ? error.name : 'unknown'
      });
    if (job.kind === 'daily_review') {
      // The report row is the state: its review is written once, and a redelivered job finds it released.
      try {
        if (await container.aiWriter.claimJob(job.id, container.clock.now()))
          await runDailyReview(job.reportId, container, requestId, onError);
      } catch (error) {
        // D1 failed: the Cron fallback releases the numbers alone after its deadline.
        onError(error);
      }
      message.ack();
      continue;
    }
    if (job.kind === 'style_lessons') {
      try {
        if (await container.aiWriter.claimJob(job.id, container.clock.now()))
          await runStyleLessons(container, requestId, onError);
      } catch (error) {
        // D1 failed: the edits stay unread, the next hourly run takes them.
        onError(error);
      }
      message.ack();
      continue;
    }
    if (job.kind === 'hypotheses') {
      try {
        if (await container.aiWriter.claimJob(job.id, container.clock.now()))
          await runHypothesesReview(job.reportId, container, requestId, onError);
      } catch (error) {
        // D1 failed: the hypotheses stay as they were until next Monday.
        onError(error);
      }
      message.ack();
      continue;
    }
    if (job.kind === 'source_media') {
      await runSourceMediaJob(job, container, token, requestId, onError);
      message.ack();
      continue;
    }
    if (job.kind === 'patch_publish') {
      await runPatchPublishJob(job, container, token, requestId, onError);
      message.ack();
      continue;
    }
    if (job.kind === 'picture_trial') {
      await runPictureTrial(container, job, requestId, onError).catch(onError);
      message.ack();
      continue;
    }
    if (job.kind === 'treasure_watch') {
      await runTreasureWatch(container, job, requestId, onError);
      message.ack();
      continue;
    }
    if (job.kind === 'series_publish') {
      await runSeriesPublishStep(
        container,
        job,
        token,
        (chatId) => sourceMediaDeps(container, token, chatId),
        requestId,
        onError
      );
      message.ack();
      continue;
    }
    if (job.kind === 'series_post') {
      try {
        if (await container.aiWriter.claimJob(job.id, container.clock.now())) {
          await writeSeriesPost(container, job, token, requestId, onError);
          await container.aiWriter.finishJob(job.id, container.clock.now());
        }
      } catch (error) {
        onError(error);
      }
      message.ack();
      continue;
    }
    if (job.kind === 'source_event') {
      // An event with its own dota2.com page gets a planned series instead of one post (owner, 21.10.2026). Claimed
      // here first, so a redelivered copy plans nothing twice; without a page (or a plan) the one post follows.
      let planned = false;
      try {
        // A second id of the same job (its last character changed): the writer's own claim below keeps the job id.
        if (!(await container.aiWriter.claimJob(`${job.id.slice(0, 35)}s`, container.clock.now()))) {
          message.ack();
          continue;
        }
        planned = await planEventSeries(container, job, token, requestId, onError);
      } catch (error) {
        onError(error);
      }
      if (planned) {
        await container.dotaRepository.finishAiDraft({ externalId: job.externalId, jobId: job.id }).catch(onError);
        message.ack();
        continue;
      }
    }
    if (token === '') {
      // Without the token the chat cannot be reached at all; the job is dropped with the code.
      logger.error({ component: 'ai_queue', operation: 'run', requestId, errorCode: 'BOT_TOKEN_MISSING' });
      message.ack();
      continue;
    }
    const api = new Api(token, { timeoutSeconds: TELEGRAM_TIMEOUT_SECONDS });
    let writerJob: WriterJob;
    if (job.kind === 'source_event') {
      // Its «Пишу…» message is sent here, not by Cron. A redelivered copy loses the claim below and removes its own.
      // Before that message nothing is claimed and no model is called: a failure gives the event back to Cron.
      const release = () =>
        container.dotaRepository
          .releaseAiDraft({ externalId: job.externalId, jobId: job.id })
          .catch((error: unknown) => onError(error));
      let messageId: number;
      try {
        const source = await container.dotaRepository.findSteamAnnouncement(job.externalId);
        if (source === null) {
          logger.error({ component: 'ai_queue', operation: job.kind, requestId, errorCode: 'SOURCE_EVENT_GONE' });
          message.ack();
          continue;
        }
        if (await skipDullHotfix(container, job, source, requestId, onError)) {
          message.ack();
          continue;
        }
        // With the automatic publishing on, the owner may be asleep (owner, 22.10.2026): no sound for this message.
        const quiet = job.automatic && (await autopublishOn(container, requestId).catch(() => false));
        messageId = (
          await api.sendMessage(job.chatId, eventWritingText(source.eventType, source.title), {
            disable_notification: quiet
          })
        ).message_id;
      } catch (error) {
        onError(error);
        await release();
        message.ack();
        continue;
      }
      writerJob = {
        id: job.id,
        kind: 'event',
        chatId: job.chatId,
        messageId,
        appOrigin: job.appOrigin,
        externalId: job.externalId,
        automatic: job.automatic
      };
    } else if (job.kind === 'treasure_post') {
      // A treasure's follow-up: written and, when allowed, published like Cron's event draft (owner, 22.10.2026).
      let messageId: number;
      try {
        const source = await container.dotaRepository.findSteamAnnouncement(job.externalId);
        const quiet = await autopublishOn(container, requestId).catch(() => false);
        messageId = (
          await api.sendMessage(
            job.chatId,
            `Сокровищница: ${source?.title ?? ''}
Новые подробности, пишу пост…`,
            {
              disable_notification: quiet
            }
          )
        ).message_id;
      } catch (error) {
        onError(error);
        message.ack();
        continue;
      }
      writerJob = {
        id: job.id,
        kind: 'event',
        chatId: job.chatId,
        messageId,
        appOrigin: job.appOrigin,
        externalId: job.externalId,
        automatic: true,
        followUp: { number: job.number, task: job.task }
      };
    } else {
      writerJob = job;
    }
    // Never throws: every failure, the D1 claim's included, ends in the job's own message. A throw would
    // redeliver the batch.
    await runAiJob(writerJob, {
      api,
      clock: container.clock,
      // A redelivered message finds its claim and stops: the model is never called twice for one job.
      claim: async () => {
        const claimed = await container.aiWriter.claimJob(job.id, container.clock.now(), {
          chatId: writerJob.chatId,
          messageId: writerJob.messageId
        });
        if (!claimed && writerJob.kind === 'event')
          await api.deleteMessage(writerJob.chatId, writerJob.messageId).catch((error: unknown) => onError(error));
        return claimed;
      },
      finish: () => container.aiWriter.finishJob(job.id, container.clock.now()),
      writer: () => createWriterDeps(container, requestId),
      sourceEvents: sourceEventWriter({
        repo: container.dotaRepository,
        ...(container.dotaWatcher.digestPatch === undefined ? {} : { digestPatch: container.dotaWatcher.digestPatch }),
        onError
      }),
      autopublish: async (eventJob, draft) => {
        const outcome = await autopublishSourceEvent(
          container,
          await createWriterDeps(container, requestId),
          sourceMediaDeps(container, token, eventJob.chatId, { requestId, onError }),
          {
            externalId: eventJob.externalId,
            ...draft,
            requestId,
            ...(eventJob.followUp === undefined ? {} : { followUp: eventJob.followUp.number }),
            ...((await isPatchEvent(container, eventJob.externalId, eventJob.followUp !== undefined))
              ? {
                  queuePicture: (postId: string) =>
                    container.aiJobs.send({
                      id: container.newId(),
                      kind: 'patch_publish',
                      chatId: eventJob.chatId,
                      appOrigin: eventJob.appOrigin,
                      postId,
                      externalId: eventJob.externalId
                    })
                }
              : {})
          }
        );
        container.logger.info({
          component: 'autopublish',
          operation: 'source_event',
          requestId,
          status: outcome.kind === 'skipped' ? outcome.reason : outcome.kind
        });
        return autopublishNote(outcome, eventJob.appOrigin, eventJob.externalId);
      },
      onError
    });
    message.ack();
  }
}
