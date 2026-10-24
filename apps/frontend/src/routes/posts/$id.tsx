import { createFileRoute, Outlet, useMatches } from '@tanstack/react-router';
import { PostEditPage } from '../../pages/posts/PostEditPage';

export const Route = createFileRoute('/posts/$id')({
  component: PostEditRoute
});

function PostEditRoute() {
  const { id } = Route.useParams();
  const matches = useMatches();
  const isEditRoute = matches.at(-1)?.routeId === '/posts/$id';

  return isEditRoute ? <PostEditPage id={id} /> : <Outlet />;
}
