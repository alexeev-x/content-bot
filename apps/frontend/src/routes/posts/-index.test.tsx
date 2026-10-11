import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createMemoryHistory, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accessToken, post, postPage } from '../../test/fixtures';
import { server, setupMswServer } from '../../test/msw';
import { createTestQueryClient } from '../../test/query-wrapper';
import { clearSession, setSession } from '../../shared/api/session';
import { ToastProvider } from '../../shared/ui';

vi.mock('../../app/layouts/AppLayout', () => ({ AppLayout: () => <Outlet /> }));

import { routeTree } from '../../routeTree.gen';

setupMswServer();

beforeEach(() => {
  clearSession();
  setSession(accessToken());
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe('/posts URL-backed list state', () => {
  it('restores the search field and sort from browser history', async () => {
    const requests: URL[] = [];
    server.use(
      http.get('*/api/v1/posts', ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        const q = url.searchParams.get('q');
        return HttpResponse.json(postPage([post({ title: q === 'beta' ? 'Beta' : 'Alpha' })], { totalCount: 1 }));
      })
    );
    const history = createMemoryHistory({ initialEntries: ['/posts?q=alpha'] });
    const router = createRouter({ routeTree, history });
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    );

    const field = await screen.findByRole('searchbox', { name: 'Поиск по постам' });
    await screen.findByText('Alpha');
    expect((field as HTMLInputElement).value).toBe('alpha');

    await act(async () => {
      history.push('/posts?q=beta&sort=title&direction=ascending');
    });
    await waitFor(() =>
      expect((screen.getByRole('searchbox', { name: 'Поиск по постам' }) as HTMLInputElement).value).toBe('beta')
    );
    await screen.findByText('Beta');
    await waitFor(() =>
      expect(
        requests.some(
          (url) =>
            url.searchParams.get('q') === 'beta' &&
            url.searchParams.get('sort') === 'title' &&
            url.searchParams.get('direction') === 'ascending'
        )
      ).toBe(true)
    );

    await act(async () => {
      history.back();
    });
    await waitFor(() =>
      expect((screen.getByRole('searchbox', { name: 'Поиск по постам' }) as HTMLInputElement).value).toBe('alpha')
    );
    await screen.findByText('Alpha');
  });
});
