import type { PublicationStatus } from '@alexeev/contracts';
import { approvePost } from '../../modules/content';
import { createPublication, getPublication, listDestinations, listPublications } from '../../modules/publishing';
import { AppError } from '../../shared/app-error';
import type { Container } from '../container';
import type { PublishActionStore } from './publish-action-store';

// One button per enabled channel up to this many; with more the owner picks the channel in the Studio.
export const MAX_PUBLISH_BUTTONS = 3;
// An older button is refused: the post and the channels have likely moved on.
export const ACTION_TTL_MS = 24 * 60 * 60 * 1000;

export interface PublishButton {
  /** What goes into callback_data (see `callbackDataOf`). */
  token: string;
  channelTitle: string;
}

export type PublishOutcome =
  /** `postId` is null only for a token that names no action. */
  | { kind: 'expired'; postId: string | null }
  | { kind: 'changed'; postId: string }
  | { kind: 'busy' }
  /** The post's files are still being imported: publishing now would send it without them. */
  | { kind: 'importing'; postId: string }
  /** The post already has a live or finished publication to this channel. */
  | { kind: 'duplicate'; postId: string }
  | { kind: 'queued'; postId: string; channelTitle: string; status: PublicationStatus };

export interface PublishActions {
  /** The buttons for a draft at `post.revision`; empty when there is no channel or too many. Never throws. */
  buttons(post: { id: string; revision: number }): Promise<PublishButton[]>;
  perform(token: string): Promise<PublishOutcome>;
}

export type PublishActionsContainer = Pick<
  Container,
  | 'clock'
  | 'logger'
  | 'newId'
  | 'posts'
  | 'postSource'
  | 'destinations'
  | 'publications'
  | 'idempotency'
  | 'publishActions'
  | 'mediaImports'
>;

// callback_data is at most 64 bytes: a prefix and a short token.
export const CALLBACK_PREFIX = 'pub:';
export const callbackDataOf = (token: string): string => `${CALLBACK_PREFIX}${token}`;

const ACTIVE_CHECK_LIMIT = 50;
const INACTIVE_STATUSES: ReadonlySet<PublicationStatus> = new Set(['failed', 'cancelled']);

const CHANGED_REASONS = new Set([
  'STALE_REVISION',
  'POST_NOT_APPROVED',
  'POST_ARCHIVED',
  'POST_NOT_FOUND',
  'DESTINATION_NOT_FOUND',
  'DESTINATION_DISABLED'
]);

const reasonOf = (error: unknown): string | undefined =>
  error instanceof AppError && typeof error.details?.reason === 'string' ? error.details.reason : undefined;

// Wires the buttons to the content and publishing use cases. The bot never sends: it creates a «now»
// publication through the same use case as the HTTP API, and the dispatcher does the sending.
export function createPublishActions(
  container: PublishActionsContainer,
  config: { actor: string; requestId: string; timezone: () => Promise<string> }
): PublishActions {
  const { clock, logger } = container;
  // Read on use: building the actions must not need D1 for an update that never reaches for them.
  const store = {
    create: (...args: Parameters<PublishActionStore['create']>) => container.publishActions.create(...args),
    find: (id: string) => container.publishActions.find(id),
    claim: (id: string, now: number) => container.publishActions.claim(id, now),
    complete: (id: string, publicationId: string) => container.publishActions.complete(id, publicationId),
    refuse: (id: string) => container.publishActions.refuse(id)
  };
  const { actor } = config;

  const approve = async (postId: string, revision: number): Promise<void> => {
    try {
      await approvePost({ repo: container.posts, now: clock.now() }, { actor, id: postId, input: { revision } });
    } catch (error) {
      // A concurrent tap (or the Studio) approved first; the state is re-read by the caller.
      if (!(error instanceof AppError) || error.code !== 'CONFLICT') throw error;
    }
  };

  // A live, sent or unresolved publication of this post to this channel. The one this very action made
  // before a crash (same instant and revision) is not a duplicate: the idempotency key answers for it.
  async function hasActivePublication(
    action: { postId: string; destinationId: string },
    revision: number,
    usedAt: number
  ): Promise<boolean> {
    const page = await listPublications(
      { repo: container.publications, now: clock.now() },
      { postId: action.postId, destinationId: action.destinationId, limit: ACTIVE_CHECK_LIMIT, order: 'desc' }
    );
    return page.items.some(
      (item) =>
        !INACTIVE_STATUSES.has(item.status) &&
        !(item.postRevision === revision && Date.parse(item.scheduledAt) === usedAt)
    );
  }

  async function run(action: NonNullable<Awaited<ReturnType<PublishActionStore['find']>>>): Promise<PublishOutcome> {
    const changed: PublishOutcome = { kind: 'changed', postId: action.postId };
    const destination = await container.destinations.findById(action.destinationId);
    if (destination === null || !destination.enabled) {
      await store.refuse(action.id);
      return changed;
    }
    // Files still arriving: the post would go out without them, and the snapshot is taken at approval.
    // Nothing is refused: the same button works once the import report is out.
    if (await container.mediaImports.hasOpenImport(action.postId)) return { kind: 'importing', postId: action.postId };
    let post = await container.postSource.findState(action.postId);
    if (post === null || post.archived) {
      await store.refuse(action.id);
      return changed;
    }
    if (post.status === 'draft') {
      if (post.revision !== action.postRevision) {
        await store.refuse(action.id);
        return changed;
      }
      try {
        await approve(action.postId, action.postRevision);
      } catch (error) {
        // An empty post cannot be approved: nothing to publish.
        if (error instanceof AppError && error.code === 'VALIDATION_ERROR') {
          await store.refuse(action.id);
          return changed;
        }
        throw error;
      }
      post = await container.postSource.findState(action.postId);
    }
    // Approving moves the revision by one; the owner approving in the Studio first has the same effect.
    if (post === null || post.archived || post.status !== 'approved' || post.revision !== action.postRevision + 1) {
      await store.refuse(action.id);
      return changed;
    }

    const usedAt = action.usedAt ?? clock.now();
    if (await hasActivePublication(action, post.revision, usedAt)) {
      await store.refuse(action.id);
      return { kind: 'duplicate', postId: action.postId };
    }
    let publication;
    try {
      publication = await createPublication(
        {
          publications: container.publications,
          destinations: container.destinations,
          posts: container.postSource,
          idempotency: container.idempotency,
          // «Now» publications announce nothing; this reply is the owner's confirmation.
          notifier: { scheduled: () => undefined, rescheduled: () => undefined, cancelled: () => undefined },
          now: clock.now(),
          newId: container.newId
        },
        {
          actor,
          // The same key for every token of this post revision and channel: a repeat, a concurrent tap or a
          // second token that slipped in gets the same publication.
          idempotencyKey: `tg-pub-${action.postId}-${action.postRevision}-${action.destinationId}`,
          input: {
            postId: action.postId,
            revision: post.revision,
            destinationId: action.destinationId,
            scheduledAt: new Date(usedAt).toISOString(),
            timezone: await config.timezone()
          }
        }
      );
    } catch (error) {
      const reason = reasonOf(error);
      if (reason === 'IN_FLIGHT') return { kind: 'busy' };
      // The Studio queued the same post to this channel between our check and our write.
      if (reason === 'ALREADY_PUBLISHED') {
        await store.refuse(action.id);
        return { kind: 'duplicate', postId: action.postId };
      }
      if (reason === 'SCHEDULE_OUT_OF_RANGE') return { kind: 'expired', postId: action.postId };
      if (reason !== undefined && CHANGED_REASONS.has(reason)) {
        await store.refuse(action.id);
        return changed;
      }
      throw error;
    }
    await store.complete(action.id, publication.id);
    return {
      kind: 'queued',
      postId: action.postId,
      channelTitle: destination.title,
      status: publication.status
    };
  }

  async function perform(token: string): Promise<PublishOutcome> {
    const action = await store.find(token);
    if (action === null) return { kind: 'expired', postId: null };

    if (action.status === 'stale') return { kind: 'changed', postId: action.postId };
    if (action.status === 'done' && action.publicationId !== null) {
      const [publication, destination] = await Promise.all([
        getPublication({ repo: container.publications, now: clock.now() }, action.publicationId),
        container.destinations.findById(action.destinationId)
      ]);
      return {
        kind: 'queued',
        postId: action.postId,
        channelTitle: destination?.title ?? '',
        status: publication.status
      };
    }
    if (action.status === 'done') return { kind: 'changed', postId: action.postId };

    if (action.status === 'pending') {
      if (clock.now() - action.createdAt > ACTION_TTL_MS) return { kind: 'expired', postId: action.postId };
      // Refusals that consume nothing come first: a tap during the import must not fix `used_at`, or the
      // same button would be dead once the 5-minute schedule window has passed.
      if (await container.mediaImports.hasOpenImport(action.postId))
        return { kind: 'importing', postId: action.postId };
      // The loser of a race reads the winner's instant, so both build the same publication request.
      await store.claim(action.id, clock.now());
      const claimed = await store.find(action.id);
      if (claimed === null) return { kind: 'expired', postId: action.postId };
      // Another tap may have finished meanwhile: its result is the answer.
      return claimed.status === 'claimed' ? run(claimed) : perform(token);
    }
    return run(action);
  }

  return {
    perform,
    async buttons(post) {
      try {
        const page = await listDestinations(
          { repo: container.destinations },
          { enabled: 'true', limit: MAX_PUBLISH_BUTTONS + 1 }
        );
        if (page.items.length === 0 || page.items.length > MAX_PUBLISH_BUTTONS) return [];
        const wanted = page.items.map((destination) => ({
          // 20 random hex characters; the UUID's dashes and version digits add nothing.
          id: container.newId().replaceAll('-', '').slice(0, 20),
          postId: post.id,
          destinationId: destination.id,
          postRevision: post.revision
        }));
        const tokens = await store.create(wanted, clock.now());
        return page.items.map((destination, index) => ({
          token: tokens[index] ?? '',
          channelTitle: destination.title
        }));
      } catch (error) {
        logger.error({
          component: 'bot',
          operation: 'publish_actions.create',
          requestId: config.requestId,
          errorCode: error instanceof AppError ? error.code : error instanceof Error ? error.name : 'unknown'
        });
        return [];
      }
    }
  };
}
