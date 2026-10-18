import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { PostNewPage } from '../../pages/posts/PostNewPage';

// «Создать опрос» from a saved post opens the empty composer on the poll tab.
const searchSchema = z.object({ tab: z.enum(['poll']).optional().catch(undefined) });

export const Route = createFileRoute('/posts/new')({
  validateSearch: searchSchema,
  component: PostNewRoute
});

function PostNewRoute() {
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  // replace: Back from the saved draft must not return to an empty «new» form.
  return (
    <PostNewPage
      initialTab={tab}
      onCreated={(post) => void navigate({ to: '/posts/$id', params: { id: post.id }, replace: true })}
    />
  );
}
