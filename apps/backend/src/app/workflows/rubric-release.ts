import { createPublication, createPublicationSeries } from '../../modules/publishing';
import { NOT_AFTER_MS, scheduleOf, type SlotRow } from '../../modules/rubric-scheduler';
import { AppError } from '../../shared/app-error';
import { describeError } from '../../platform/error-detail';
import type { Container } from '../container';
import { kickDispatch } from './dispatch-now';
import { RUBRIC_ACTOR } from './rubric-actor';

// A ready slot goes to publishing a minute before its time (area-backend-core §10): one publication, or a series
// (the picture, then its poll 30 seconds later), each with `not_after` = slot + 20 minutes, so a post never goes out
// late. The idempotency key is the slot: a release repeated after a crash returns the same publication.

const POLL_GAP_MS = 30_000;
const SERIES_INTERVAL_MINUTES = 5;
const MOSCOW = 'Europe/Moscow';

const silentNotifier = { scheduled: () => undefined, rescheduled: () => undefined, cancelled: () => undefined };

export async function releaseSlot(
  container: Pick<
    Container,
    | 'clock'
    | 'rubricSlots'
    | 'publications'
    | 'destinations'
    | 'postSource'
    | 'idempotency'
    | 'newId'
    | 'aiJobs'
    | 'logger'
  >,
  slot: SlotRow,
  destinationId: string
): Promise<'released' | 'failed' | 'lost'> {
  const now = container.clock.now();
  const posts = slot.build?.posts ?? [];
  if (posts.length === 0) {
    return (await container.rubricSlots.transition({
      id: slot.id,
      from: 'ready',
      to: 'empty',
      now,
      set: { errorCode: 'NOTHING_BUILT', errorStep: 'release' }
    }))
      ? 'failed'
      : 'lost';
  }
  const deps = {
    publications: container.publications,
    destinations: container.destinations,
    posts: container.postSource,
    idempotency: container.idempotency,
    notifier: silentNotifier,
    now,
    newId: container.newId
  };
  const scheduledAt = new Date(slot.slotAt).toISOString();
  const notAfter = slot.slotAt + NOT_AFTER_MS;
  let publicationIds: string[];
  try {
    const [first] = posts;
    if (posts.length === 1 && first !== undefined) {
      const publication = await createPublication(deps, {
        actor: RUBRIC_ACTOR,
        idempotencyKey: `rubric:${slot.id}`,
        notAfter,
        input: { postId: first.postId, revision: first.revision, destinationId, scheduledAt, timezone: MOSCOW }
      });
      publicationIds = [publication.id];
    } else {
      const series = await createPublicationSeries(deps, {
        actor: RUBRIC_ACTOR,
        idempotencyKey: `rubric:${slot.id}`,
        notAfter,
        gapMs: POLL_GAP_MS,
        input: {
          items: posts.map((post) => ({ postId: post.postId, revision: post.revision })),
          destinationId,
          scheduledAt,
          timezone: MOSCOW,
          intervalMinutes: SERIES_INTERVAL_MINUTES
        }
      });
      publicationIds = series.publications.map((publication) => publication.id);
    }
  } catch (error) {
    // Refused for good (the post changed, the channel went away): the slot ends; never retried into a late post.
    await container.rubricSlots.recordAttempt({
      slotId: slot.id,
      attempt: slot.attempt,
      step: 'release',
      rubricKey: slot.rubricKey,
      outcome: 'failed',
      provider: null,
      httpStatus: null,
      errorCode: error instanceof AppError ? (error.details?.['reason'] ?? error.code) : 'RELEASE_FAILED',
      message: describeError(error),
      startedAt: now,
      finishedAt: container.clock.now()
    });
    return (await container.rubricSlots.transition({
      id: slot.id,
      from: 'ready',
      to: 'send_failed',
      now,
      set: {
        errorCode: error instanceof AppError ? (error.details?.['reason'] ?? error.code) : 'RELEASE_FAILED',
        errorStep: 'release'
      }
    }))
      ? 'failed'
      : 'lost';
  }
  const times = scheduleOf('released', { slotAt: slot.slotAt, buildAt: slot.buildAt }, now);
  const moved = await container.rubricSlots.transition({
    id: slot.id,
    from: 'ready',
    to: 'released',
    now,
    set: {
      publicationId: publicationIds[0] ?? null,
      build: slot.build === null ? null : { ...slot.build, publications: publicationIds },
      nextActionAt: times.nextActionAt,
      deadlineAt: times.deadlineAt
    }
  });
  // A post due within the minute goes now rather than at the next tick.
  if (moved && slot.slotAt <= now + 60_000) await kickDispatch(container).catch(() => undefined);
  return moved ? 'released' : 'lost';
}
