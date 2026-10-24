import type { ReactNode } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createTestQueryClient } from '../../test/query-wrapper';
import { ToastProvider } from '../../shared/ui';
import { clearSession, setSession } from '../../shared/api/session';
import { accessToken, destination, post, publication, publicationPage } from '../../test/fixtures';
import { server, setupMswServer } from '../../test/msw';
import { PublicationsPage } from './PublicationsPage';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(cleanup);

// Regression: rows used to render before their post and channel arrived, flashing «Пост недоступен».
it('keeps the skeleton until the rows can show their post and channel', async () => {
  server.use(
    http.get('*/api/v1/publications', async () => {
      await delay(20);
      return HttpResponse.json(publicationPage([publication()]));
    }),
    http.get('*/api/v1/posts/:id', async () => {
      await delay(120);
      return HttpResponse.json(post({ title: 'Мой пост' }));
    }),
    http.get('*/api/v1/destinations', async () => {
      await delay(60);
      return HttpResponse.json({ items: [destination()], nextCursor: null });
    })
  );
  const seen = new Set<string>();
  const observer = new MutationObserver(() => {
    const text = document.body.textContent ?? '';
    if (text.includes('Пост недоступен')) seen.add('post');
    if (text.includes('Канал недоступен')) seen.add('channel');
    if (text.includes('Публикаций пока нет') || text.includes('Ничего не найдено')) seen.add('empty');
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  await renderInApp(
    <PublicationsPage search={{}} onSearchChange={() => {}} onOpenPosts={() => {}} onPublishPost={() => {}} />
  );
  await waitFor(() => expect(document.body.textContent).toContain('Мой пост'));
  observer.disconnect();
  expect([...seen]).toEqual([]);
});

async function renderInApp(ui: ReactNode) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <ToastProvider>{ui}</ToastProvider> }),
    history: createMemoryHistory({ initialEntries: ['/'] })
  });
  await router.load();
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
