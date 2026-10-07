import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { PostsPage } from '../../pages/posts/PostsPage';

// The tab and the search live in the URL (back button, shareable); a broken value falls back to «Все».
const searchSchema = z.object({
  view: z.enum(['all', 'drafts', 'archive']).optional().catch(undefined),
  q: z.string().optional().catch(undefined)
});

export const Route = createFileRoute('/posts/')({
  validateSearch: searchSchema,
  component: PostsRoute
});

function PostsRoute() {
  const { view, q } = Route.useSearch();
  const setSearch = Route.useNavigate();
  const navigate = useNavigate();
  return (
    <PostsPage
      view={view ?? 'all'}
      query={q ?? ''}
      // The search text is not carried across tabs: the new tab starts unfiltered.
      onViewChange={(next) => void setSearch({ search: { view: next === 'all' ? undefined : next }, replace: true })}
      onQueryChange={(next) =>
        void setSearch({ search: (prev) => ({ ...prev, q: next === '' ? undefined : next }), replace: true })
      }
      onOpen={(id) => void navigate({ to: '/posts/$id', params: { id } })}
      onCreate={() => void navigate({ to: '/posts/new' })}
    />
  );
}
