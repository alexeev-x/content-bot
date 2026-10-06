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
import { ToastProvider } from '../../../shared/ui';
import { createTestQueryClient } from '../../../test/query-wrapper';

/** The real shell provides toasts and a router; tests mount a minimal copy so links and toasts behave as in the app. */
export async function renderInApp(ui: ReactNode, client = createTestQueryClient()) {
  const root = createRootRoute({
    component: () => (
      <ToastProvider>
        {ui}
        <Outlet />
      </ToastProvider>
    )
  });
  const stub = (path: string) => createRoute({ getParentRoute: () => root, path, component: () => null });
  const router = createRouter({
    routeTree: root.addChildren([stub('/'), stub('/settings/channels'), stub('/publications'), stub('/posts/$id')]),
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

export const inDays = (days: number): string => {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setUTCSeconds(0, 0);
  return date.toISOString();
};
