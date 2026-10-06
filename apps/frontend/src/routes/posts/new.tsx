import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { PostNewPage } from '../../pages/posts/PostNewPage';

export const Route = createFileRoute('/posts/new')({
  component: PostNewRoute
});

function PostNewRoute() {
  const navigate = useNavigate();
  // replace: Back from the saved draft must not return to an empty «new» form.
  return (
    <PostNewPage onCreated={(post) => void navigate({ to: '/posts/$id', params: { id: post.id }, replace: true })} />
  );
}
