import { approvePost } from '../../modules/content';
import { createPublication } from '../../modules/publishing';
import { getOwnerOperationsSettings } from '../../modules/settings';
import type { WriterDeps } from '../../modules/ai';
import type { Container } from '../container';
import { approveSourceAiDraft } from './approve-source-ai-draft';
import { attachSourceEventImages, type SourceMediaDeps } from './source-event-media';

// Valve's news published without the owner (owner, 21.10.2026: «он должен автоматом публиковать, ибо я спать буду»).
// Only Cron's first draft of a new event whose fact check found nothing unsupported (the caller checks both), only
// while the owner keeps it on with an enabled channel and under the daily limit. Everything that can be checked is
// checked before the draft is approved: until then a refusal leaves the owner the draft as before. Once approved, the
// draft cannot be edited any more, so a later failure leaves the post in the studio and says why (QA 22.10.2026).
// One event gives one publication: the event's job is claimed once and the publication's key is the event's.

/** The actor of everything the automatic publishing does: its own idempotency scope and audit rows. */
export const AUTOPUBLISH_ACTOR = 'autopublish';
const DAY_MS = 24 * 60 * 60 * 1000;
// A few pictures keep one queue message well inside the Free plan's 50 subrequests (each may try mirrors).
const MAX_PICTURES = 4;
/**
 * Pictures attached per queue invocation (QA 23.10.2026, measured): one costs about 13 D1 statements, its improvement
 * about 5, the approval and the publication of the last message about 20, the job's claim 3, and the Free plan allows
 * 50; so one picture a message, the rest going on in the next one.
 */
export const PICTURES_PER_RUN = 1;

export type AutopublishOutcome =
  /** `publicationId` null: written, but its answer was lost. */
  | { kind: 'published'; postId: string; publicationId: string | null; title: string; pictureFailed?: true }
  /** Approved but not published: the owner publishes it from the studio (`postId` null: from the event). */
  | { kind: 'held'; postId: string | null; title: string; reason: 'no_images' | 'failed' | 'limit' }
  /** Approved; its pictures are attached and the post published by its own queue job (`patch_publish`). */
  | { kind: 'queued'; postId: string; title: string }
  /** More pictures to attach: the queue job goes on from `from` in a message of its own; nothing is published yet. */
  | { kind: 'continue'; postId: string; from: number }
  /** Nothing done: the owner gets the draft as before. */
  | { kind: 'skipped'; reason: 'off' | 'channel' | 'limit' };

export async function autopublishSourceEvent(
  container: Container,
  deps: WriterDeps,
  media: SourceMediaDeps,
  input: {
    externalId: string;
    rootId: string;
    versionId: string;
    requestId: string;
    /** A treasure's follow-up (1 or 2): its own publication key, not the event's own post. */
    followUp?: number;
    /** The follow-up's pictures: the told sets' icons (owner, 23.10.2026), none without them. */
    followUpUrls?: string[];
    /**
     * A patch: its picture is drawn by a job of its own (QA 23.10.2026: three tries do not fit the Free plan's 50
     * subrequests next to the writer's), which then publishes the approved post.
     */
    queuePicture?: (postId: string) => Promise<void>;
  }
): Promise<AutopublishOutcome> {
  const settings = await getOwnerOperationsSettings({
    repo: container.settings,
    logger: container.logger,
    requestId: input.requestId
  });
  const { enabled, destinationId, dailyLimit } = settings.autopublish;
  if (!enabled || destinationId === null) return { kind: 'skipped', reason: 'off' };
  const channel = await container.destinations.findById(destinationId);
  if (channel === null || !channel.enabled) return { kind: 'skipped', reason: 'channel' };
  const now = container.clock.now();
  if ((await container.publications.countCreatedBy(AUTOPUBLISH_ACTOR, now - DAY_MS)) >= dailyLimit)
    return { kind: 'skipped', reason: 'limit' };

  let postId: string;
  let title: string;
  try {
    ({ postId } = await approveSourceAiDraft(container, deps, {
      rootId: input.rootId,
      versionId: input.versionId,
      actor: AUTOPUBLISH_ACTOR,
      provenance: 'OWNER_PREAPPROVED',
      queueMedia: false,
      ...(input.followUp === undefined ? {} : { linkToEvent: false })
    }));
    title = (await container.posts.findById(postId))?.title ?? '';
  } catch (error) {
    // Failed before the draft was approved: it is still the owner's to edit. Failed after: it no longer is, so the
    // owner is pointed to the event in the studio, where its post (if any) waits.
    const approved = (await deps.writer.revisions(input.versionId).catch(() => [])).some(
      (revision) => revision.provenance === 'OWNER_PREAPPROVED'
    );
    if (!approved) throw error;
    return { kind: 'held', postId: null, title: '', reason: 'failed' };
  }
  if (input.queuePicture !== undefined) {
    try {
      await input.queuePicture(postId);
      return { kind: 'queued', postId, title };
    } catch (error) {
      container.logger.warn({
        component: 'autopublish',
        operation: 'source_event',
        requestId: input.requestId,
        status: 'held',
        errorCode: error instanceof Error ? error.name : 'unknown'
      });
      return { kind: 'held', postId, title, reason: 'failed' };
    }
  }
  return publishApprovedEventPost(container, media, {
    postId,
    title,
    externalId: input.externalId,
    requestId: input.requestId,
    destinationId,
    timezone: settings.timezone,
    ...(input.followUp === undefined ? {} : { followUp: input.followUp }),
    ...(input.followUpUrls === undefined ? {} : { followUpUrls: input.followUpUrls })
  });
}

/**
 * The `patch_publish` job: the approved patch post gets its picture and goes out, while the owner still keeps the
 * automatic publishing on with a channel (off meanwhile: the post waits in the studio).
 */
export async function publishQueuedPatchPost(
  container: Container,
  media: SourceMediaDeps,
  input: {
    postId: string;
    externalId: string;
    requestId: string;
    followUp?: number;
    followUpUrls?: string[];
    /** The picture to start from: a later message of the same job goes on where the last one stopped. */
    from?: number;
  }
): Promise<AutopublishOutcome> {
  const settings = await getOwnerOperationsSettings({
    repo: container.settings,
    logger: container.logger,
    requestId: input.requestId
  });
  const title = (await container.posts.findById(input.postId))?.title ?? '';
  const { enabled, destinationId } = settings.autopublish;
  if (!enabled || destinationId === null) return { kind: 'held', postId: input.postId, title, reason: 'failed' };
  return publishApprovedEventPost(container, media, {
    ...input,
    title,
    destinationId,
    timezone: settings.timezone,
    dailyLimit: settings.autopublish.dailyLimit
  });
}

async function publishApprovedEventPost(
  container: Container,
  media: SourceMediaDeps,
  input: {
    postId: string;
    title: string;
    externalId: string;
    requestId: string;
    destinationId: string;
    timezone: string;
    followUp?: number;
    followUpUrls?: string[];
    from?: number;
    /** The owner's daily limit, counted again before the publication of a deferred post. */
    dailyLimit?: number;
  }
): Promise<AutopublishOutcome> {
  const { postId, destinationId } = input;
  let title = input.title;
  try {
    // An event post always carries its picture (owner, 21.10.2026): attached before approval, since an approved post
    // no longer takes files. With pictures in the announcement and none of them arriving, the owner decides.
    // A patch gets its drawn picture instead; one that could not be drawn goes without (plan 22.10.2026).
    const from = input.from ?? 0;
    const part = { from, count: PICTURES_PER_RUN };
    const { found, remaining, pictureFailed } =
      input.followUp === undefined
        ? await attachSourceEventImages(media, { postId, externalId: input.externalId, max: MAX_PICTURES, ...part })
        : input.followUpUrls !== undefined && input.followUpUrls.length > 0
          ? await attachSourceEventImages(media, {
              postId,
              externalId: input.externalId,
              urls: input.followUpUrls,
              max: input.followUpUrls.length,
              ...part
            })
          : { found: 0, remaining: 0, pictureFailed: undefined };
    if (remaining > 0) return { kind: 'continue', postId, from: from + PICTURES_PER_RUN };
    // Posts deferred over several messages may all have passed the first count: the limit is counted again here.
    if (
      input.dailyLimit !== undefined &&
      !(await container.publications.hasLivePublication(postId, destinationId).catch(() => false)) &&
      (await container.publications.countCreatedBy(AUTOPUBLISH_ACTOR, container.clock.now() - DAY_MS)) >=
        input.dailyLimit
    )
      return { kind: 'held', postId, title, reason: 'limit' };
    const draft = await container.posts.findById(postId);
    if (draft === null) throw new Error('The approved post is gone');
    // Counted over every message of the job: pictures found and none of them arrived, the owner decides.
    if (found > 0 && (draft.media?.length ?? 0) === 0) return { kind: 'held', postId, title, reason: 'no_images' };
    title = draft.title;
    const post =
      draft.status === 'approved'
        ? draft
        : await approvePost(
            { repo: container.posts, now: container.clock.now() },
            { actor: AUTOPUBLISH_ACTOR, id: postId, input: { revision: draft.revision } }
          );
    const publication = await createPublication(
      {
        publications: container.publications,
        destinations: container.destinations,
        posts: container.postSource,
        idempotency: container.idempotency,
        // The owner hears of it once, from the bot's own short note.
        notifier: { scheduled: () => undefined, rescheduled: () => undefined, cancelled: () => undefined },
        now: container.clock.now(),
        newId: container.newId
      },
      {
        actor: AUTOPUBLISH_ACTOR,
        idempotencyKey:
          input.followUp === undefined
            ? `autopublish:${input.externalId}`
            : `autopublish:${input.externalId}:follow-up-${input.followUp}`,
        input: {
          postId,
          revision: post.revision,
          destinationId,
          scheduledAt: new Date(container.clock.now()).toISOString(),
          timezone: input.timezone
        }
      }
    );
    return {
      kind: 'published',
      postId,
      publicationId: publication.id,
      title: post.title,
      ...(pictureFailed === true ? { pictureFailed } : {})
    };
  } catch (error) {
    container.logger.warn({
      component: 'autopublish',
      operation: 'source_event',
      requestId: input.requestId,
      status: 'held',
      errorCode: error instanceof Error ? error.name : 'unknown'
    });
    // The publication's write may have committed and lost its answer: never tell the owner «not published» about a
    // post that goes out anyway (publishing it again by hand would double it).
    const live = await container.publications.hasLivePublication(postId, destinationId).catch(() => false);
    if (live) return { kind: 'published', postId, publicationId: null, title };
    return { kind: 'held', postId, title, reason: 'failed' };
  }
}
