import { approvePost, createPost } from '../../modules/content';
import { createPublication } from '../../modules/publishing';
import { getOwnerOperationsSettings } from '../../modules/settings';
import { aiPostText, draftFromMessageText } from '../bot/draft-from-message';
import type { Container } from '../container';
import { AUTOPUBLISH_ACTOR } from './autopublish-source-event';
import { kickDispatch } from './dispatch-now';

// A short post the event writer does not write (a build of the game with nothing in it, owner 24.10.2026),
// published at once under the automatic publishing's switch, channel and daily limit, like every source's post.
// A ```diff fence in the text becomes the red and green code block.

const DAY_MS = 24 * 60 * 60 * 1000;

export type FixedPostOutcome = 'published' | 'off' | 'limit' | 'failed';

/**
 * One post and one publication per `key`, however often it is called. `text` is asked for only once the post may go
 * out (a paid line is not written for nothing). Throws on a write that failed.
 */
export async function publishFixedPost(
  container: Container,
  key: string,
  text: () => Promise<string>,
  requestId: string
): Promise<FixedPostOutcome> {
  const settings = await getOwnerOperationsSettings({ repo: container.settings, logger: container.logger, requestId });
  const { enabled, destinationId, dailyLimit } = settings.autopublish;
  if (!enabled || destinationId === null) return 'off';
  const channel = await container.destinations.findById(destinationId);
  if (channel === null || !channel.enabled) return 'off';
  const now = container.clock.now();
  if ((await container.publications.countCreatedBy(AUTOPUBLISH_ACTOR, now - DAY_MS)) >= dailyLimit) return 'limit';
  const linked = aiPostText(await text());
  const draft = draftFromMessageText(linked.text, linked.entities);
  if (!draft.ok) return 'failed';
  const created = await createPost(
    { repo: container.posts, idempotency: container.idempotency, now, newId: container.newId },
    { actor: AUTOPUBLISH_ACTOR, idempotencyKey: key, input: draft.input }
  );
  const post =
    created.status === 'approved'
      ? created
      : await approvePost(
          { repo: container.posts, now: container.clock.now() },
          { actor: AUTOPUBLISH_ACTOR, id: created.id, input: { revision: created.revision } }
        );
  try {
    await createPublication(
      {
        publications: container.publications,
        destinations: container.destinations,
        posts: container.postSource,
        idempotency: container.idempotency,
        notifier: { scheduled: () => undefined, rescheduled: () => undefined, cancelled: () => undefined },
        now: container.clock.now(),
        newId: container.newId
      },
      {
        actor: AUTOPUBLISH_ACTOR,
        idempotencyKey: `autopublish:${key}`,
        input: {
          postId: post.id,
          revision: post.revision,
          destinationId,
          scheduledAt: new Date(container.clock.now()).toISOString(),
          timezone: settings.timezone
        }
      }
    );
  } catch (error) {
    // The write may have committed and lost its answer: a post that goes out anyway is published (review 24.10.2026).
    if (!(await container.publications.hasLivePublication(post.id, destinationId).catch(() => false))) throw error;
  }
  await kickDispatch(container);
  return 'published';
}
