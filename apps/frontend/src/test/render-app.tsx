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
import type { ReactNode } from 'react';
import { ToastProvider } from '../shared/ui';
import { createTestQueryClient } from './query-wrapper';

/**
 * A page under a minimal router and toast provider, with stub targets for the links it offers.
 * `router.state.location` tells where a press navigated.
 */
export async function renderPage(ui: ReactNode, client = createTestQueryClient()) {
  const root = createRootRoute({
    component: () => (
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    )
  });
  const page = createRoute({ getParentRoute: () => root, path: '/', component: () => ui });
  const stub = (path: string) => createRoute({ getParentRoute: () => root, path, component: () => <p>{path}</p> });
  const router = createRouter({
    routeTree: root.addChildren([page, stub('/incidents'), stub('/publications'), stub('/posts'), stub('/posts/new')]),
    history: createMemoryHistory({ initialEntries: ['/'] })
  });
  await router.load();
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { client, router };
}
