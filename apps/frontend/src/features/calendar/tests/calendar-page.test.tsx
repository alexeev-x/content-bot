import { QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CalendarPage } from '../../../pages/calendar/CalendarPage';
import { ToastProvider } from '../../../shared/ui';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken } from '../../../test/fixtures';
import { setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import type { CalendarView } from '../model/calendar-range';

setupMswServer();

beforeEach(() => {
  clearSession();
  setSession(accessToken());
});

describe('CalendarPage', () => {
  it('renders the calendar and its accessible view selector after data loads', async () => {
    function Root() {
      const [search, setSearch] = useState<{ date?: string; view?: CalendarView }>({ date: '2026-10-07', view: 'day' });
      return (
        <ToastProvider>
          <CalendarPage
            search={search}
            onSearchChange={(patch) => setSearch((previous) => ({ ...previous, ...patch }))}
          />
        </ToastProvider>
      );
    }

    const root = createRootRoute({ component: Root });
    const leaf = (path: string) => createRoute({ getParentRoute: () => root, path, component: () => null });
    const router = createRouter({
      routeTree: root.addChildren([leaf('/'), leaf('/posts/new'), leaf('/posts/$id'), leaf('/publications')]),
      history: createMemoryHistory({ initialEntries: ['/'] })
    });
    await router.load();
    const client = createTestQueryClient();
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: /День ·/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ближайшие' })).toBeTruthy();
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });
});
