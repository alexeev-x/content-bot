import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { PostNewPage } from '../../pages/posts/PostNewPage';

const slotIntentSchema = z.object({
  slot: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .optional()
    .catch(undefined),
  timezone: z.string().min(1).max(64).optional().catch(undefined),
  destinationId: z.string().uuid().optional().catch(undefined),
  fold: z.enum(['first', 'second']).optional().catch(undefined)
});

export const Route = createFileRoute('/posts/new')({
  validateSearch: slotIntentSchema,
  component: PostNewRoute
});

function PostNewRoute() {
  const navigate = useNavigate();
  const slotIntent = Route.useSearch();
  // replace: Back from the saved draft must not return to an empty «new» form.
  return (
    <PostNewPage
      slotIntent={slotIntent.slot ? slotIntent : undefined}
      onCreated={(post) => void navigate({ to: '/posts/$id', params: { id: post.id }, replace: true })}
    />
  );
}
