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

export type AutopublishOutcome =
  /** `publicationId` null: written, but its answer was lost. */
  | { kind: 'published'; postId: string; publicationId: string | null; title: string }
  /** Approved but not published: the owner publishes it from the studio (`postId` null: from the event). */
  | { kind: 'held'; postId: string | null; title: string; reason: 'no_images' | 'failed' }
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
    /** A treasure's follow-up (1 or 2): its own publication key, no pictures, not the event's own post. */
    followUp?: number;
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
  try {
    // An event post always carries its picture (owner, 21.10.2026): attached before approval, since an approved post
    // no longer takes files. With pictures in the announcement and none of them arriving, the owner decides.
    const { attached, found } =
      input.followUp === undefined
        ? await attachSourceEventImages(media, { postId, externalId: input.externalId, max: MAX_PICTURES })
        : { attached: 0, found: 0 };
    if (found > 0 && attached === 0) return { kind: 'held', postId, title, reason: 'no_images' };
    const draft = await container.posts.findById(postId);
    if (draft === null) throw new Error('The approved post is gone');
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
          timezone: settings.timezone
        }
      }
    );
    return { kind: 'published', postId, publicationId: publication.id, title: post.title };
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
