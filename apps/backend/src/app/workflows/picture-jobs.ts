import type { AiJob } from '../bot/ai-job';
import type { Container } from '../container';

// A source post's pictures are attached by a queue job after approval (the patch cover is drawn then, owner
// 23.10.2026: «блокировать пост, пока картинка не загрузится»). Queuing marks the post, its last message clears the
// mark; the time bound frees a post whose job died, as the queue consumer's own 15 minutes would.

/** A picture job's message runs at most the queue consumer's 15 minutes; a continuation marks the post again. */
export const PICTURES_PENDING_MS = 15 * 60_000;

/** Marks the post as waiting for its pictures, then queues the job; a failed send clears the mark again. */
export async function queuePictureJob(
  container: Container,
  job: Extract<AiJob, { kind: 'source_media' | 'patch_publish' }>
): Promise<void> {
  await container.posts.setMediaPending(job.postId, container.clock.now() + PICTURES_PENDING_MS);
  try {
    await container.aiJobs.send(job);
  } catch (error) {
    await container.posts.setMediaPending(job.postId, null).catch(() => undefined);
    throw error;
  }
}

/** The pictures are done (or given up): the post may be published. */
export async function picturesDone(
  container: Container,
  postId: string,
  onError: (error: unknown) => void
): Promise<void> {
  await container.posts.setMediaPending(postId, null).catch(onError);
}
