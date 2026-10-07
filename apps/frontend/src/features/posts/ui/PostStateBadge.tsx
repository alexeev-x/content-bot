import type { PostDto } from '@alexeev/contracts';
import { StatusBadge, StatusPill } from '../../../shared/ui';
import { listStateOf } from '../model/post-state';
import { postsCopy } from './copy';

const copy = postsCopy.list.state;

/** The derived list state of a post (docs/stories/posts-lifecycle.md §2): icon plus text, never colour alone. */
export function PostStateBadge({ post }: { post: PostDto }) {
  const state = listStateOf(post);
  switch (state.kind) {
    case 'unknown':
      return <StatusPill label={copy.unknown} group="unknown" icon="help" />;
    case 'sending':
      return <StatusPill label={copy.sending} group="active" icon="loader" />;
    case 'scheduled':
      return <StatusPill label={copy.scheduled} group="pending" icon="clock" />;
    case 'archived':
      return <StatusBadge status="approved" />;
    default:
      return <StatusBadge status={state.kind} />;
  }
}
