import { QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { useState } from 'react';
import { vi } from 'vitest';
import { ToastProvider } from '../../../shared/ui';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { PostsList, type PostsView } from '../index';

export const onOpen = vi.fn();
export const onCreate = vi.fn();
export const onOpenPublications = vi.fn();
export const onReconcile = vi.fn();

function Harness({ initialView }: { initialView: PostsView }) {
  const [view, setView] = useState<PostsView>(initialView);
  return (
    <PostsList
      view={view}
      onViewChange={setView}
      onOpen={onOpen}
      onCreate={onCreate}
      onOpenPublications={onOpenPublications}
      onReconcile={onReconcile}
    />
  );
}

/** The list inside a router (banners link to /publications) and the toast region. */
export function renderList(initialView: PostsView = 'all') {
  const client = createTestQueryClient();
  const root = createRootRoute({
    component: () => (
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    )
  });
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <Harness initialView={initialView} />
  });
  const publications = createRoute({
    getParentRoute: () => root,
    path: '/publications',
    validateSearch: (search: Record<string, unknown>) => ({
      id: typeof search['id'] === 'string' ? search['id'] : undefined
    }),
    component: () => <p>Публикации</p>
  });
  const router = createRouter({
    routeTree: root.addChildren([index, publications]),
    history: createMemoryHistory({ initialEntries: ['/'] })
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { client, router };
}
