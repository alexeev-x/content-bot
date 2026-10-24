import type { PostDto } from '@alexeev/contracts';
import { getPost, type PostPublicationSummarySource, type PostRepository } from '../../modules/content';
import { type LifecycleRepository, returnPostToDraft } from '../../modules/lifecycle';

// The lifecycle module owns the guarded write; content owns the DTO read including retained history.
export async function returnPostToDraftAndRead(
  deps: { lifecycle: LifecycleRepository; posts: PostRepository; summaries: PostPublicationSummarySource; now: number },
  command: { actor: string; id: string; revision: number }
): Promise<PostDto> {
  await returnPostToDraft({ repo: deps.lifecycle, now: deps.now }, command);
  return getPost({ repo: deps.posts, summaries: deps.summaries, now: deps.now }, command.id);
}
