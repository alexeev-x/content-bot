import { QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { ToastProvider } from '../../../shared/ui';
import { createTestQueryClient } from '../../../test/query-wrapper';
import type { AppearanceValue } from '../model/appearance-value';
import { AppearanceEditor } from '../ui/AppearanceEditor';
import { ThemeToggle } from '../ui/ThemeToggle';

export function renderEditor(withToggle = false) {
  const preview = vi.fn<(value: AppearanceValue) => void>();
  const client = createTestQueryClient();
  const root = createRootRoute({
    component: () => (
      <ToastProvider>
        {withToggle ? <ThemeToggle preview={preview} /> : null}
        <AppearanceEditor preview={preview} />
      </ToastProvider>
    )
  });
  const index = createRoute({ getParentRoute: () => root, path: '/' });
  const router = createRouter({
    routeTree: root.addChildren([index]),
    history: createMemoryHistory({ initialEntries: ['/'] })
  });
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { ...view, preview, client };
}
