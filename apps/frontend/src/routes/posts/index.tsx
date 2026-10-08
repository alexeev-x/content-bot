import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { publicationsPageQueryOptions } from '../../features/publications';
import { PostsPage } from '../../pages/posts/PostsPage';

// The tab lives in the URL (back button, shareable); a broken value falls back to «Все». The search text is local,
// and the old `?status=` and `?q=` of earlier links are dropped by the schema.
const searchSchema = z.object({
  view: z.enum(['all', 'drafts', 'archive']).optional().catch(undefined)
});

export const Route = createFileRoute('/posts/')({
  validateSearch: searchSchema,
  component: PostsRoute
});

function PostsRoute() {
  const { view } = Route.useSearch();
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
    await navigate({ to: '/publications', search: { post, ...(only ? { id: only } : {}) } });
  };
  return (
    <PostsPage
      view={view ?? 'all'}
      onViewChange={(next) => void setSearch({ search: { view: next === 'all' ? undefined : next }, replace: true })}
      onOpen={(id) => void navigate({ to: '/posts/$id', params: { id } })}
      onCreate={() => void navigate({ to: '/posts/new' })}
      onPublications={(post) => void navigate({ to: '/publications', search: { post } })}
      onReconcile={(post) => void reconcile(post)}
    />
  );
}
