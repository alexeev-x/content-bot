import type { PostDto } from '@alexeev/contracts';
import { getPost, type PostPublicationSummarySource, type PostRepository } from '../../modules/content';
import { archivePost, type LifecycleRepository } from '../../modules/lifecycle';

/**
 * Manual archive writes through lifecycle and then reads the canonical PostDto through content,
 * exactly like restore: the response includes archive timestamps and publication summary.
 */
export async function archiveAndReadPost(
  deps: { lifecycle: LifecycleRepository; posts: PostRepository; summaries: PostPublicationSummarySource; now: number },
  command: { actor: string; id: string; revision: number }
): Promise<PostDto> {
  await archivePost({ repo: deps.lifecycle, now: deps.now }, command);
  return getPost({ repo: deps.posts, summaries: deps.summaries, now: deps.now }, command.id);
}
