import type { PostDto } from '@alexeev/contracts';
import { useCreatePost } from '../api/posts-queries';

/**
 * Duplicating is intentionally a normal create request: only editable content is copied.
 * Approval state, publications, archive state and provider ids never leak into the new draft.
 */
export function useDuplicatePost() {
  const create = useCreatePost();

  return {
    isPending: create.isPending,
    duplicate: (post: Pick<PostDto, 'title' | 'body' | 'entities'>) =>
      create.mutateAsync({
        title: post.title,
        body: post.body,
        entities: post.entities
      })
  };
}
