import { Api } from 'grammy';
import { aiJobSchema } from './bot/ai-job';
import { runAiJob } from './bot/ai-writer';
import { createWriterDeps } from './bot/writer-deps';
import { runDailyReview } from './workflows/daily-review';
import { runHypothesesReview } from './workflows/hypotheses';
import { sourceEventWriter } from './workflows/source-event-ai-draft';
import { attachSourceEventImages } from './workflows/source-event-media';
import { uploadPostMedia } from '../modules/content';
import { AppError } from '../shared/app-error';
import { runStyleLessons } from './workflows/style-lessons';
import type { AiJob, WriterJob } from './bot/ai-job';
import type { Container } from './container';

// Consumer of Queue AI_JOBS (docs/backend/bot.md «AI writer»): one model call per message, with the 15 minutes
// of wall time a consumer has instead of the 30 s left to a webhook's `waitUntil` (owner, 19.10.2026: text
// quality first). The queue never retries (`max_retries: 0`): a model call is paid, and every failure is shown
// in the job's own «Пишу…» message instead.

/** Same budget as a webhook's Bot API calls: a hung Telegram must not hold the consumer. */
const TELEGRAM_TIMEOUT_SECONDS = 10;

const EVENT_LABEL = { treasure: 'Сокровищница', news: 'Новость', patch: 'Патч' } as const;
const eventWritingText = (type: keyof typeof EVENT_LABEL, title: string) =>
  `${EVENT_LABEL[type]} в Steam: ${title}
Пишу пост…`;

/** Attaches an approved event post's images once, then tells the owner how many arrived. Never throws. */
async function runSourceMediaJob(
  job: Extract<AiJob, { kind: 'source_media' }>,
  container: Container,
  token: string,
  onError: (error: unknown) => void
): Promise<void> {
  let text: string;
  try {
    if (!(await container.aiWriter.claimJob(job.id, container.clock.now()))) return;
    const storage = container.mediaStorage;
    if (storage === undefined) throw new AppError('UNAVAILABLE', 'Media storage is not configured');
    const { attached, found } = await attachSourceEventImages(
      {
        repo: container.dotaRepository,
        postState: async (id) => {
          const state = await container.postMedia.findPostState(id);
          return state === null ? null : { revision: state.revision, mediaCount: state.media.length };
        },
        upload: (command) =>
          uploadPostMedia(
            { repo: container.postMedia, storage, now: container.clock.now(), newId: container.newId },
            { ...command, actor: container.ownerChatId ?? 'system' }
          ),
        // Only a stable code with the CDN host and status, never a URL.
        onSkip: (reason) =>
          container.logger.warn({
            component: 'source_media',
            operation: 'attach',
            status: 'skipped',
            errorCode: reason
          })
      },
      job
    );
    if (found === 0) return;
    text =
      attached === found
        ? `Картинки из анонса прикреплены к черновику: ${attached}.`
        : `Прикреплено картинок из анонса: ${attached} из ${found}. Остальные добавьте в студии.`;
    await container.aiWriter.finishJob(job.id, container.clock.now());
  } catch (error) {
    onError(error);
    text = 'Не удалось прикрепить картинки из анонса. Добавьте их в студии.';
  }
  if (token === '') return;
  await new Api(token, { timeoutSeconds: TELEGRAM_TIMEOUT_SECONDS })
    .sendMessage(job.chatId, text)
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
      await runSourceMediaJob(job, container, token, onError);
      message.ack();
      continue;
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
        messageId = (await api.sendMessage(job.chatId, eventWritingText(source.eventType, source.title))).message_id;
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
        externalId: job.externalId
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
      sourceEvents: sourceEventWriter({ repo: container.dotaRepository, onError }),
      onError
    });
    message.ack();
  }
}
