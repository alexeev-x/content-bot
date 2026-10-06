import { postStatusSchema } from '@alexeev/contracts';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { PostsPage } from '../../pages/posts/PostsPage';

// Filters live in the URL (back button, shareable); a broken value falls back to «all».
const searchSchema = z.object({
  status: postStatusSchema.optional().catch(undefined),
  q: z.string().optional().catch(undefined)
});

export const Route = createFileRoute('/posts/')({
  validateSearch: searchSchema,
  component: PostsRoute
});

function PostsRoute() {
  const { status, q } = Route.useSearch();
  const setSearch = Route.useNavigate();
  const navigate = useNavigate();
  return (
    <PostsPage
      status={status}
      query={q ?? ''}
      onStatusChange={(next) => void setSearch({ search: (prev) => ({ ...prev, status: next }), replace: true })}
      onQueryChange={(next) =>
        void setSearch({ search: (prev) => ({ ...prev, q: next === '' ? undefined : next }), replace: true })
      }
      onOpen={(id) => void navigate({ to: '/posts/$id', params: { id } })}
      onCreate={() => void navigate({ to: '/posts/new' })}
    />
  );
}
