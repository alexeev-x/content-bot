import { richMediaId } from '@alexeev/contracts';
import { InputFile } from 'grammy';
import { type PictureRenderer } from '../../integrations/browser-render/browser-render';
import { createTelegramApi, type TelegramSendApi } from '../../integrations/telegram/telegram-api';
import {
  drawAnketaScene,
  drawForgottenScene,
  drawHoroscopeScene,
  drawRubricScene,
  drawSuspectScene,
  writeRubricCaptionTyped
} from '../../modules/ai';
import { RUBRIC_TITLES, type RubricKey } from '../../modules/rubrics';
import { describeError } from '../../platform/error-detail';
import type { Logger } from '../../platform/logging/logger';
import { getOwnerOperationsSettings } from '../../modules/settings';
import { AppError } from '../../shared/app-error';
import type { Container } from '../container';
import { buildRubricPost } from '../rubric-build/build-post';
import { labRubricPorts } from '../rubric-build/ports';
import { fillBareFinds, heroMatchSource, trackerFinds } from '../rubric-build/sources';
import type { BuildDeps } from '../rubric-build/types';
import { pictureImproverFor } from '../workflows/picture-quality';

// DEV only (owner, 25.10.2026): one rubric's post from live data — the picture rendered by the browser from Valve's
// icons, the caption, the poll — goes to the owner's chat with the bot, the way subscribers would see it. The post is
// built by app/rubric-build, the same code the scheduler posts with.

const TELEGRAM_TIMEOUT_MS = 20_000;
const FLAGS = { disable_notification: false, protect_content: false } as const;
/** A rubric's source photo is shown across the post: narrower than this, it goes through the picture law. */
const RUBRIC_PHOTO_MIN_WIDTH = 1200;
/** The free plan takes one screenshot per 10 seconds. */
const BROWSER_GAP_MS = 11_000;

/** A local run's copy of a sample (`SAMPLE_MIRROR`, local vars only): read back from the local R2 to check results. */
export type SampleMirror = (name: string, body: Uint8Array | string, contentType: string) => Promise<void>;

export type RubricSampleDeps = Omit<BuildDeps, 'log' | 'pace'> & {
  /** Local runs only: every sample is also kept in the local R2. */
  mirror?: SampleMirror | null;
  telegram: TelegramSendApi;
  ownerChatId: string;
  logger: Logger;
  requestId: string;
};

/** One rubric built the way production would post it, sent to the owner's chat; a note tells what failed. */
export async function sendRubricSample(deps: RubricSampleDeps, rubric: RubricKey): Promise<void> {
  const startedAt = Date.now();
  const log = (status: string, errorCode?: string) =>
    deps.logger.info({
      component: 'rubric-samples',
      operation: rubric,
      requestId: deps.requestId,
      status,
      ...(errorCode === undefined ? {} : { errorCode }),
      durationMs: Date.now() - startedAt
    });
  const post = await buildRubricPost(
    { ...deps, log, pace: () => new Promise((resolve) => setTimeout(resolve, BROWSER_GAP_MS)) },
    rubric,
    { strict: false }
  );
  const { title, text, entities, picture, album, pollOnly, followUp } = post;
  const notes = post.notes.map((note) => note.text);

  if (deps.mirror) {
    const stamp = `${new Date(deps.now).toISOString().replace(/[:.]/g, '-')}-${rubric}`;
    await deps
      .mirror(
        `samples/${stamp}.txt`,
        [text, '', ...notes.map((note) => `NOTE: ${note}`)].join('\n'),
        'text/plain; charset=utf-8'
      )
      .catch(() => undefined);
    if (picture !== null) await deps.mirror(`samples/${stamp}.png`, picture, 'image/png').catch(() => undefined);
    // A local run checks samples from the copy; nothing goes to Telegram (owner, 28.10.2026: «в тг ничего слать не надо»).
    log('sent');
    return;
  }

  try {
    const signal = () => AbortSignal.timeout(TELEGRAM_TIMEOUT_MS);
    if (notes.length > 0)
      await deps.telegram.sendMessage(
        deps.ownerChatId,
        [`«${title}»:`, ...notes].join('\n'),
        { ...FLAGS, entities: [] },
        signal()
      );
    const rich = post.rich;
    if (album.length > 0) {
      // One rich message, the photos and GIFs as a carousel on top (owner, 27.10.2026: «формата rich, чтобы был как
      // карусель»), then the text, the verdict and the links as words.
      const extension = { photo: 'jpg', video: 'mp4', animation: 'gif' } as const;
      await deps.telegram.sendRichMessage(
        deps.ownerChatId,
        {
          html: post.albumRich ?? '',
          media: album.map(({ kind, bytes }, index) => ({
            id: richMediaId(index),
            kind,
            file: new InputFile(bytes, `${rubric}-${index + 1}.${extension[kind]}`)
          }))
        },
        FLAGS,
        signal()
      );
    } else if (pollOnly) {
      // The picture goes inside the poll (Bot API 10.3), no post before it (owner, 26.10.2026: «вся информация на
      // картинке и сразу опрос»).
    } else if (rich !== null) {
      await deps.telegram.sendRichMessage(
        deps.ownerChatId,
        {
          html: rich,
          media:
            picture === null
              ? []
              : [{ id: richMediaId(0), kind: 'photo', file: new InputFile(picture, `${rubric}.png`) }]
        },
        FLAGS,
        signal()
      );
    } else if (picture !== null) {
      await deps.telegram.sendPhoto(
        deps.ownerChatId,
        new InputFile(picture, `${rubric}.png`),
        { ...FLAGS, caption: text, caption_entities: entities },
        signal()
      );
    } else {
      await deps.telegram.sendMessage(deps.ownerChatId, text, { ...FLAGS, entities }, signal());
    }
    if (post.poll !== null) {
      await deps.telegram.sendPoll(
        deps.ownerChatId,
        {
          ...FLAGS,
          question: post.poll.question,
          options: post.poll.options,
          type: post.poll.type,
          // One answer, the options in a random order for each voter (owner, 26.10.2026).
          allows_multiple_answers: false,
          shuffle_options: true,
          ...(post.poll.correctOption === null ? {} : { correct_option_ids: [post.poll.correctOption] }),
          ...(post.poll.explanation === null ? {} : { explanation: post.poll.explanation }),
          ...(pollOnly && picture !== null
            ? { media: { type: 'photo' as const, media: new InputFile(picture, `${rubric}.png`) } }
            : {})
        },
        signal()
      );
    }
    if (followUp !== null) {
      // The channel gets it `afterMinutes` later; the owner's sample shows it at once, marked.
      await deps.telegram.sendMessage(
        deps.ownerChatId,
        followUp.afterMinutes === null
          ? 'Второй пост — в канале после выхода следующего патча; здесь сразу, по последнему патчу:'
          : `Второй пост — в канале через ${Math.round(followUp.afterMinutes / 60)} ч, здесь сразу:`,
        { ...FLAGS, entities: [] },
        signal()
      );
      if (followUp.picture !== null)
        await deps.telegram.sendPhoto(
          deps.ownerChatId,
          new InputFile(followUp.picture, `${rubric}-answer.png`),
          { ...FLAGS, caption: followUp.text, caption_entities: [] },
          signal()
        );
      else await deps.telegram.sendMessage(deps.ownerChatId, followUp.text, { ...FLAGS, entities: [] }, signal());
    }
  } catch (error) {
    log('failed', 'TELEGRAM_SEND');
    // Telegram's own refusal (method, HTTP status, e.g. «can't parse rich message») tells the owner which part it
    // rejected; `describeError` bounds it and strips secrets.
    throw new AppError('UNAVAILABLE', 'Telegram did not take the sample', { reason: describeError(error) });
  }
  log('sent');
}

/** What a sample needs beyond the container: the browser and STRATZ, read from the Worker's env by `lab-queue.ts`. */
export type RubricSampleAccess = {
  renderer: PictureRenderer | null;
  mirror?: SampleMirror | null;
  stratzAccess: { token: string; bridgeUrl?: string } | null;
};

/** The `rubric_sample` job: runs once per press and tells the owner in the chat when the sample could not be built. */
export async function runRubricSampleJob(
  container: Container,
  access: RubricSampleAccess,
  token: string,
  rubric: RubricKey,
  requestId: string,
  onError: (error: unknown) => void
): Promise<void> {
  const ownerChatId = container.ownerChatId;
  if (ownerChatId === null || token === '') return;
  const telegram = createTelegramApi(token);
  const { timezone } = await getOwnerOperationsSettings({
    repo: container.settings,
    logger: container.logger,
    requestId
  });
  const aiDeps = {
    repo: container.aiRepository,
    clock: container.clock,
    timezone,
    newId: container.newId,
    provider: container.aiProvider
  };
  try {
    await sendRubricSample(
      {
        gameFinds: async (since) => {
          const stored = await container.gameFileBuilds.recentFinds(since);
          return fillBareFinds(container, stored.length > 0 ? stored : await trackerFinds(container, since));
        },
        stratzAccess: access.stratzAccess,
        mirror: access.mirror ?? null,
        heroMatches: heroMatchSource(container),
        ...labRubricPorts(container),
        renderer: access.renderer,
        ai: {
          caption: (input) => writeRubricCaptionTyped(aiDeps, input),
          scene: (input) => drawRubricScene({ ...aiDeps, images: container.aiImageProvider, onError }, input),
          heroScene: ({ scene, ...input }) =>
            (scene === 'forgotten' ? drawForgottenScene : scene === 'suspect' ? drawSuspectScene : drawAnketaScene)(
              { ...aiDeps, images: container.aiImageProvider, onError },
              input
            ),
          fortuneScene: (input) => drawHoroscopeScene({ ...aiDeps, images: container.aiImageProvider, onError }, input)
        },
        improvePhoto: pictureImproverFor(container, requestId, onError, RUBRIC_PHOTO_MIN_WIDTH),
        telegram,
        ownerChatId,
        random: container.random,
        now: container.clock.now(),
        logger: container.logger,
        requestId
      },
      rubric
    );
  } catch (error) {
    onError(error);
    // «No data» names what was missing (a tier-list look, a bracket): the owner sees which part to look at.
    const missing =
      error instanceof AppError && error.details?.['reason'] === 'NO_DATA'
        ? `: ${error.message.replace(/^No data for the rubric: /, '').slice(0, 400)}`
        : '';
    const reason =
      error instanceof AppError ? `${error.details?.['reason'] ?? error.code}${missing}` : describeError(error);
    await access
      .mirror?.(
        `samples/${new Date(container.clock.now()).toISOString().replace(/[:.]/g, '-')}-${rubric}-FAILED.txt`,
        `образец не собран. ${reason}`,
        'text/plain; charset=utf-8'
      )
      .catch(() => undefined);
    await telegram
      .sendMessage(
        ownerChatId,
        `«${RUBRIC_TITLES[rubric]}»: образец не собран. ${reason}`,
        { ...FLAGS, entities: [] },
        AbortSignal.timeout(TELEGRAM_TIMEOUT_MS)
      )
      .catch(() => undefined);
  }
}
