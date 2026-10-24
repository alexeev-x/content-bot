import type { PostDto } from '@alexeev/contracts';
import { getPost, type PostPublicationSummarySource, type PostRepository } from '../../modules/content';
import { type LifecycleRepository, restorePost } from '../../modules/lifecycle';

// Restoring changes the post (lifecycle owns the write) and the answer is the post with its
// publication summary (content owns the read), so the route needs both modules.
export async function restoreAndReadPost(
  deps: { lifecycle: LifecycleRepository; posts: PostRepository; summaries: PostPublicationSummarySource; now: number },
  command: { actor: string; id: string; revision: number }
): Promise<PostDto> {
  await restorePost({ repo: deps.lifecycle, now: deps.now }, command);
  return getPost({ repo: deps.posts, summaries: deps.summaries, now: deps.now }, command.id);
}
