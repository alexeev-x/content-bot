import type { PostDto } from '@alexeev/contracts';

/** How often a post waiting for its pictures is read again, so the studio unlocks it soon after they arrive. */
export const PICTURES_POLL_MS = 10_000;

/**
 * Whether the bot is still attaching the post's pictures (the patch cover is drawn after approval; owner, 23.10.2026):
 * nothing is approved or published until it is done or its time ran out.
 */
export function picturesPending(
  post: Pick<PostDto, 'mediaPendingUntil'> | null | undefined,
  now = Date.now()
): boolean {
  return post?.mediaPendingUntil != null && Date.parse(post.mediaPendingUntil) > now;
}
