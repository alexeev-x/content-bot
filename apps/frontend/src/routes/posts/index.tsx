import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { publicationsPageQueryOptions } from '../../features/publications';
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
  const queryClient = useQueryClient();
  // One `unknown` publication opens its drawer directly; several (or a failed lookup) show the filtered list.
  const reconcile = async (post: string) => {
    const filters = { postId: post, status: 'unknown' } as const;
    const items = await queryClient
      .fetchQuery({ ...publicationsPageQueryOptions(filters), staleTime: 0 })
      .then((page) => page.items)
      .catch(() => []);
    const only = items.length === 1 ? items[0]?.id : undefined;
    await navigate({ to: '/publications', search: { status: 'unknown', post, ...(only ? { id: only } : {}) } });
  };
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
      onReconcile={(post) => void reconcile(post)}
    />
  );
}
