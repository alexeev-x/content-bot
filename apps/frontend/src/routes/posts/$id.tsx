import { createFileRoute } from '@tanstack/react-router';
import { PostEditPage } from '../../pages/posts/PostEditPage';

export const Route = createFileRoute('/posts/$id')({
  component: PostEditRoute
});

function PostEditRoute() {
  const { id } = Route.useParams();
  return <PostEditPage id={id} />;
}
