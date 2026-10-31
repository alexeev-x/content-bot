import { createBrowserPictureRenderer, type BrowserBinding } from '../../integrations/browser-render/browser-render';
import {
  drawAnketaScene,
  drawForgottenScene,
  drawHoroscopeScene,
  drawRubricScene,
  drawSuspectScene,
  writeRubricCaptionTyped
} from '../../modules/ai';
import { approvePost, createPost, uploadPostMedia } from '../../modules/content';
import { RUBRIC_META, RUBRIC_TITLES, type RubricKey } from '../../modules/rubrics';
import { scheduleOf, type SlotRow } from '../../modules/rubric-scheduler';
import { getOwnerOperationsSettings } from '../../modules/settings';
import { describeError } from '../../platform/error-detail';
import { AppError } from '../../shared/app-error';
import type { Container } from '../container';
import { buildRubricPost } from '../rubric-build/build-post';
import { fillBareFinds, heroMatchSource, trackerFinds } from '../rubric-build/sources';
import type { BuildDeps, BuiltMedia, BuiltRubricPost } from '../rubric-build/types';
import { schedulerCapabilities, schedulerMode } from '../rubric-scheduler/runtime';
import { notifySchedulerFailure } from './rubric-notices';
import { RUBRIC_ACTOR } from './rubric-actor';
import { stratzAccess } from '../stats-access';
import { pictureImproverFor } from './picture-quality';

// The `rubric_build` job (area-backend-core §9): one slot's post built from live data in strict mode — a post worse
// than the owner approved fails its candidate — then stored as approved studio posts the release will publish. The
// build writes nothing else: the bank turn is the count of the rubric's slots, so a build that never goes out burns
// no bank line. A failed candidate gives way to the next one of the slot; with none left the slot ends empty.

const BROWSER_GAP_MS = 11_000;
const RUBRIC_PHOTO_MIN_WIDTH = 1200;
const EXTENSION = { photo: 'png', video: 'mp4', animation: 'gif' } as const;
const CONTENT_TYPE = { photo: 'image/png', video: 'video/mp4', animation: 'image/gif' } as const;

const isBrowserBinding = (value: unknown): value is BrowserBinding =>
  typeof value === 'object' && value !== null && typeof (value as { quickAction?: unknown }).quickAction === 'function';

type BankTurn = { bankSize: number; turn: number } | null;

/** The deps of a scheduler build: no owner chat, no counters written, the AI only where the mode allows it. */
async function buildDeps(
  container: Container,
  rubric: RubricKey,
  requestId: string,
  onTurn: (turn: BankTurn) => void
): Promise<BuildDeps> {
  const env = container.schedulerEnv;
  const mode = schedulerMode(env);
  const capabilities = schedulerCapabilities(env, mode);
  const onError = (error: unknown) =>
    container.logger.warn({ component: 'rubric-build', operation: rubric, requestId, errorCode: describeError(error) });
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
  const images = { ...aiDeps, images: container.aiImageProvider, onError };
  return {
    gameFinds: async (since) => {
      const stored = await container.gameFileBuilds.recentFinds(since);
      return fillBareFinds(container, stored.length > 0 ? stored : await trackerFinds(container, since));
    },
    stratzAccess: capabilities.has('stratz')
      ? stratzAccess(env.STRATZ_TOKEN, env.STATS_BRIDGE_URL, env.STATS_DIRECT)
      : null,
    heroMatches: capabilities.has('stats_db') ? heroMatchSource(container) : null,
    tellers: null,
    shameHeroes: null,
    // The turn is how many posts of this rubric are out or on their way: nothing is counted up here.
    turns: {
      next: async (_name, bankSize) => {
        const turn = await container.rubricSlots.countingOf(rubric);
        onTurn({ bankSize, turn });
        return turn;
      }
    },
    renderer:
      capabilities.has('browser') && isBrowserBinding(env.BROWSER) ? createBrowserPictureRenderer(env.BROWSER) : null,
    ai: capabilities.has('ai_text')
      ? {
          caption: (input) => writeRubricCaptionTyped(aiDeps, input),
          scene: (input) => drawRubricScene(images, input),
          heroScene: ({ scene, ...input }) =>
            (scene === 'forgotten' ? drawForgottenScene : scene === 'suspect' ? drawSuspectScene : drawAnketaScene)(
              images,
              input
            ),
          fortuneScene: (input) => drawHoroscopeScene(images, input)
        }
      : null,
    improvePhoto: pictureImproverFor(container, requestId, onError, RUBRIC_PHOTO_MIN_WIDTH),
    pace: () => new Promise((resolve) => setTimeout(resolve, BROWSER_GAP_MS)),
    log: (status, errorCode) =>
      container.logger.info({
        component: 'rubric-build',
        operation: rubric,
        requestId,
        status,
        ...(errorCode === undefined ? {} : { errorCode })
      }),
    random: container.random,
    now: container.clock.now()
  };
}

/** The built post as approved studio posts in send order: the post (with its pictures), then its poll when separate. */
async function storePosts(
  container: Container,
  slot: SlotRow,
  rubric: RubricKey,
  built: BuiltRubricPost
): Promise<{ postId: string; revision: number; kind: 'text' | 'poll' }[]> {
  const now = () => container.clock.now();
  const postDeps = () => ({
    repo: container.posts,
    idempotency: container.idempotency,
    now: now(),
    newId: container.newId
  });
  const storage = container.mediaStorage;
  if (storage === undefined)
    throw new AppError('UNAVAILABLE', 'Media storage is not bound', { reason: 'MEDIA_STORAGE_MISSING' });
  const media: BuiltMedia[] =
    built.album.length > 0 ? built.album : built.picture === null ? [] : [{ kind: 'photo', bytes: built.picture }];
  const upload = async (postId: string, revision: number, item: BuiltMedia, index: number) =>
    (
      await uploadPostMedia(
        { repo: container.postMedia, storage, now: now(), newId: container.newId },
        {
          postId,
          revision,
          fileName: `${rubric}-${index + 1}.${EXTENSION[item.kind]}`,
          contentType: CONTENT_TYPE[item.kind],
          contentLength: item.bytes.length,
          body: new Blob([item.bytes]).stream(),
          actor: RUBRIC_ACTOR,
          idempotencyKey: `rubric:${slot.id}:${slot.attempt}:media:${index}`,
          hidden: true
        }
      )
    ).revision;
  const poll = built.poll;
  const pollInput = (pictureInPoll: boolean) =>
    poll === null
      ? undefined
      : {
          question: poll.question,
          options: poll.options,
          allowsMultipleAnswers: false,
          quiz:
            poll.type === 'quiz' && poll.correctOption !== null
              ? { correctOptionIndex: poll.correctOption, explanation: poll.explanation ?? '' }
              : null,
          // One answer, the options in a random order for each voter (owner, 26.10.2026).
          shuffleOptions: true,
          pictureInPoll
        };
  const posts: { postId: string; revision: number; kind: 'text' | 'poll' }[] = [];
  const approve = async (postId: string, revision: number, kind: 'text' | 'poll') => {
    const approved = await approvePost(
      { repo: container.posts, now: now() },
      { actor: RUBRIC_ACTOR, id: postId, input: { revision } }
    );
    posts.push({ postId, revision: approved.revision, kind });
  };

  if (built.pollOnly && poll !== null) {
    const created = await createPost(postDeps(), {
      actor: RUBRIC_ACTOR,
      idempotencyKey: `rubric:${slot.id}:${slot.attempt}:poll`,
      input: { kind: 'poll', body: '', entities: [], poll: pollInput(media.length > 0) }
    });
    let revision = created.revision;
    if (media[0] !== undefined) revision = await upload(created.id, revision, media[0], 0);
    await approve(created.id, revision, 'poll');
    return posts;
  }
  const created = await createPost(postDeps(), {
    actor: RUBRIC_ACTOR,
    idempotencyKey: `rubric:${slot.id}:${slot.attempt}:post`,
    input: { kind: 'text', title: RUBRIC_TITLES[rubric], body: built.text, entities: built.entities },
    ...(built.richSource === null ? {} : { richHtml: built.richSource })
  });
  let revision = created.revision;
  for (const [index, item] of media.entries()) revision = await upload(created.id, revision, item, index);
  await approve(created.id, revision, 'text');
  if (poll !== null) {
    const pollPost = await createPost(postDeps(), {
      actor: RUBRIC_ACTOR,
      idempotencyKey: `rubric:${slot.id}:${slot.attempt}:poll`,
      input: { kind: 'poll', body: '', entities: [], poll: pollInput(false) }
    });
    await approve(pollPost.id, pollPost.revision, 'poll');
  }
  return posts;
}

/** Where a failed build goes: the next candidate of the slot (planned again at once), else the slot ends empty. */
async function failCandidate(container: Container, slot: SlotRow, code: string, step: string): Promise<void> {
  const now = container.clock.now();
  const rubric = slot.candidates[slot.candIdx] ?? slot.rubricKey;
  await container.rubricSchedulerSettings.rubricFailed(rubric, now, code);
  const next = slot.candidates[slot.candIdx + 1];
  if (next !== undefined && now < slot.slotAt - 5 * 60_000) {
    await container.rubricSlots.transition({
      id: slot.id,
      from: 'building',
      attempt: slot.attempt,
      to: 'planned',
      now,
      set: {
        candIdx: slot.candIdx + 1,
        rubricKey: next,
        nextActionAt: now,
        leaseUntil: null,
        errorCode: code,
        errorStep: step
      }
    });
    return;
  }
  await container.rubricSlots.transition({
    id: slot.id,
    from: 'building',
    attempt: slot.attempt,
    to: 'empty',
    now,
    set: { leaseUntil: null, errorCode: code, errorStep: step }
  });
}

export async function runRubricBuild(
  container: Container,
  job: { slotId: string; attempt: number },
  requestId: string
): Promise<void> {
  const slot = await container.rubricSlots.byId(job.slotId);
  // Another tick took the slot back, or it moved on: this message is stale.
  if (slot === null || slot.status !== 'building' || slot.attempt !== job.attempt) return;
  const rubric = slot.candidates[slot.candIdx] as RubricKey | undefined;
  if (rubric === undefined || RUBRIC_META[rubric] === undefined) {
    await failCandidate(container, slot, 'UNKNOWN_RUBRIC', 'data');
    return;
  }
  const startedAt = container.clock.now();
  let turn: BankTurn = null;
  const record = (
    outcome: 'ok' | 'failed' | 'skipped' | 'degraded',
    step: 'data' | 'store',
    code: string | null,
    message: string | null
  ) =>
    container.rubricSlots.recordAttempt({
      slotId: slot.id,
      attempt: slot.attempt,
      step,
      rubricKey: rubric,
      outcome,
      provider: null,
      httpStatus: null,
      errorCode: code,
      message,
      startedAt,
      finishedAt: container.clock.now()
    });

  let built: BuiltRubricPost;
  try {
    built = await buildRubricPost(await buildDeps(container, rubric, requestId, (each) => (turn = each)), rubric, {
      strict: true
    });
  } catch (error) {
    const code = error instanceof AppError ? (error.details?.['reason'] ?? error.code) : 'BUILD_FAILED';
    await record('failed', 'data', code, describeError(error));
    await failCandidate(container, slot, code, 'data');
    await notifySchedulerFailure(container, {
      key: `build:${rubric}:${code}`,
      text: `«${RUBRIC_TITLES[rubric]}» не собрана: ${describeError(error)}`
    });
    return;
  }

  // A bank that must not repeat (a riddle solved once) pauses at its end instead of going round (§11.3).
  const bank = RUBRIC_META[rubric].bank;
  const used = turn as BankTurn;
  if (bank?.exhaust === 'pause' && used !== null && used.turn >= used.bankSize) {
    await container.rubricSchedulerSettings.pauseRubric(rubric, container.clock.now(), used.bankSize);
    await record('skipped', 'data', 'BANK_EXHAUSTED', null);
    await container.rubricSlots.transition({
      id: slot.id,
      from: 'building',
      attempt: slot.attempt,
      to: 'skipped',
      now: container.clock.now(),
      set: { leaseUntil: null, errorCode: 'BANK_EXHAUSTED', errorStep: 'data' }
    });
    await notifySchedulerFailure(container, {
      key: `bank:${rubric}`,
      kind: 'bank',
      text: `«${RUBRIC_TITLES[rubric]}»: банк исчерпан (${used.bankSize}). Рубрика на паузе, пока вы не добавите записи.`
    });
    return;
  }

  let posts;
  try {
    posts = await storePosts(container, slot, rubric, built);
  } catch (error) {
    const code = error instanceof AppError ? (error.details?.['reason'] ?? error.code) : 'STORE_FAILED';
    await record('failed', 'store', code, describeError(error));
    await failCandidate(container, slot, code, 'store');
    return;
  }
  await record(built.degradations.length > 0 ? 'degraded' : 'ok', 'store', built.degradations[0] ?? null, null);
  const now = container.clock.now();
  const times = scheduleOf('ready', { slotAt: slot.slotAt, buildAt: slot.buildAt }, now);
  await container.rubricSlots.transition({
    id: slot.id,
    from: 'building',
    attempt: slot.attempt,
    to: 'ready',
    now,
    set: {
      rubricKey: rubric,
      postId: posts[0]?.postId ?? null,
      leaseUntil: null,
      nextActionAt: times.nextActionAt,
      deadlineAt: times.deadlineAt,
      build: {
        posts,
        degradations: built.degradations,
        hasPicture: built.picture !== null || built.album.length > 0,
        hasPoll: built.poll !== null,
        bankTurn: used?.turn ?? null
      }
    }
  });
}
