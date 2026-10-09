import { createFileRoute } from '@tanstack/react-router';
import { PostPublishPage } from '../../pages/posts/PostPublishPage';

export const Route = createFileRoute('/posts/$id/publish')({
  component: PostPublishRoute
});

function PostPublishRoute() {
  const { id } = Route.useParams();
  return <PostPublishPage id={id} />;
}
