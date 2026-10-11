import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { publicationsPageQueryOptions } from '../../features/publications';
import type { PostsSort } from '../../features/posts';
import { PostsPage } from '../../pages/posts/PostsPage';

// List state lives in the URL so filters remain shareable and browser navigation restores them.
const searchSchema = z
  .object({
    view: z.enum(['all', 'drafts', 'archive']).optional().catch(undefined),
    q: z.string().trim().max(120).optional().catch(undefined),
    sort: z.enum(['title', 'updated', 'sentAt', 'left']).optional().catch(undefined),
    direction: z.enum(['ascending', 'descending']).optional().catch(undefined)
  })
  .transform((search) => {
    const archive = search.view === 'archive';
    const unsupported =
      !search.sort ||
      !search.direction ||
      (archive ? search.sort === 'updated' : search.sort === 'sentAt' || search.sort === 'left');
    return unsupported ? { ...search, sort: undefined, direction: undefined } : search;
  });

export const Route = createFileRoute('/posts/')({
  validateSearch: searchSchema,
  component: PostsRoute
});

function PostsRoute() {
  const { view, q, sort, direction } = Route.useSearch();
  const setSearch = Route.useNavigate();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const listSort: PostsSort = sort && direction ? { key: sort, direction } : null;
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
      query={q ?? ''}
      sort={listSort}
      onViewChange={(next) =>
        void setSearch({
          search: (previous) => ({
            ...previous,
            view: next === 'all' ? undefined : next,
            q: undefined,
            sort: undefined,
            direction: undefined
          }),
          replace: true
        })
      }
      onQueryChange={(next) =>
        void setSearch({ search: (previous) => ({ ...previous, q: next.trim() || undefined }), replace: true })
      }
      onSortChange={(next) =>
        void setSearch({
          search: (previous) => ({ ...previous, sort: next?.key, direction: next?.direction }),
          replace: true
        })
      }
      onOpen={(id) => void navigate({ to: '/posts/$id', params: { id } })}
      onCreate={() => void navigate({ to: '/posts/new' })}
      onReconcile={(post) => void reconcile(post)}
    />
  );
}
