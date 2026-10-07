import type { PostDto } from '@alexeev/contracts';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useNavigate,
  useParams
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { PostEditor, postQueryOptions } from '../index';

/** Mirrors the real routes (new → saved post) without the publications widgets owned by other screens. */
export function renderEditorApp(
  initial: string,
  approvedActions?: (post: PostDto) => ReactNode,
  options: { browserHistory?: boolean } = {}
) {
  const client = createTestQueryClient();
  const root = createRootRoute({
    component: () => (
      <>
        <Link to="/calendar">Уйти</Link>
        <Outlet />
      </>
    )
  });
  const newRoute = createRoute({
    getParentRoute: () => root,
    path: '/posts/new',
    component: function New() {
      const navigate = useNavigate();
      return (
        <PostEditor onCreated={(post) => void navigate({ to: '/posts/$id', params: { id: post.id }, replace: true })} />
      );
    }
  });
  const editRoute = createRoute({
    getParentRoute: () => root,
    path: '/posts/$id',
    component: function Edit() {
      const { id } = useParams({ from: '/posts/$id' });
      const query = useQuery(postQueryOptions(id));
      if (!query.data) return <p>Загрузка</p>;
      return <PostEditor key={id} post={query.data} approvedActions={approvedActions} />;
    }
  });
  const elsewhere = createRoute({
    getParentRoute: () => root,
    path: '/calendar',
    component: () => <p>Другая страница</p>
  });
  const posts = createRoute({
    getParentRoute: () => root,
    path: '/posts',
    component: () => <h1>Все посты</h1>
  });
  const router = createRouter({
    routeTree: root.addChildren([newRoute, editRoute, posts, elsewhere]),
    history: options.browserHistory
      ? (window.history.replaceState(null, '', initial), createBrowserHistory())
      : createMemoryHistory({ initialEntries: [initial] })
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { router, client };
}
