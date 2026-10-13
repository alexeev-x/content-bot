import { QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  RouterProvider
} from '@tanstack/react-router';
import { http, HttpResponse } from 'msw';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '../../../shared/ui';
import { AuthProvider, useAuth } from '../../../app/auth';
import { clearSession, getAccessToken, setSession } from '../../../shared/api/session';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { setupMswServer, server } from '../../../test/msw';
import { SourcesPage } from '../../../pages/sources/SourcesPage';

setupMswServer();
beforeEach(() => {
  server.use(http.get('*/api/v1/dota/watchlists', () => HttpResponse.json({ watches: [], matches: [] })));
});
afterEach(() => {
  cleanup();
  clearSession();
});

const canonicalUrl = 'https://www.dota2.com/patches/7.41';
const detail = {
  update: {
    id: 'patch_notes:7.41',
    sourceKey: 'patch_notes',
    type: 'patch',
    title: 'Patch 7.41',
    sourceUrl: canonicalUrl,
    publishedAt: '2026-10-11T10:00:00.000Z',
    detectedAt: '2026-10-11T10:15:00.000Z',
    isBaseline: false
  },
  parseStatus: 'complete',
  facts: [
    {
      id: 'hero:axe:armor',
      entityType: 'hero',
      entityName: 'Axe',
      section: 'hero',
      change: 'Base armor increased by 1',
      direction: 'increase',
      before: '2',
      after: '3'
    }
  ]
};
const list = {
  sources: [
    {
      key: 'steam_news',
      name: 'Dota 2 · Steam Community',
      officialUrl: 'https://steamcommunity.com/app/570/news/',
      lastAttemptAt: '2026-10-11T12:00:00.000Z',
      lastSuccessAt: '2026-10-11T12:00:00.000Z',
      health: 'healthy'
    },
    {
      key: 'patch_notes',
      name: 'Dota 2 · Patch notes',
      officialUrl: 'https://www.dota2.com/patches',
      lastAttemptAt: '2026-10-11T12:00:00.000Z',
      lastSuccessAt: '2026-10-11T12:00:00.000Z',
      health: 'healthy'
    }
  ],
  updates: [detail.update]
};

async function renderSources(initialPath = '/sources') {
  const root = createRootRoute({
    component: () => (
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    )
  });
  const sources = createRoute({
    getParentRoute: () => root,
    path: '/sources',
    validateSearch: (search: Record<string, unknown>) => search,
    component: SourcesPage
  });
  const stub = (path: string) => createRoute({ getParentRoute: () => root, path, component: () => <p>{path}</p> });
  const router = createRouter({
    routeTree: root.addChildren([sources, stub('/login'), stub('/posts/$id')]),
    history: createMemoryHistory({ initialEntries: [initialPath] })
  });
  await router.load();
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return router;
}

function installDefaultHandlers() {
  server.use(
    http.get('*/api/v1/dota', () => HttpResponse.json(list)),
    http.get('*/api/v1/dota/updates/patch_notes/7.41', () => HttpResponse.json(detail))
  );
}

describe('Dota event detail', () => {
  it('adds only the confirmed hero fact with a fresh idempotency key and shows server-confirmed state', async () => {
    let idempotencyKey: string | null = null;
    let addBody: unknown;
    let added = false;
    const watch = {
      id: 'cc9a09b9-b80a-4b72-b977-6972029fd56a',
      entityType: 'hero',
      entityName: 'Axe',
      createdAt: '2026-10-12T10:00:00.000Z',
      lastMatchedUpdate: null
    };
    server.use(
      http.get('*/api/v1/dota', () => HttpResponse.json(list)),
      http.get('*/api/v1/dota/updates/patch_notes/7.41', () =>
        HttpResponse.json({ ...detail, parseStatus: 'incomplete' })
      ),
      http.post('*/api/v1/dota/watchlists', async ({ request }) => {
        idempotencyKey = request.headers.get('Idempotency-Key');
        addBody = await request.json();
        added = true;
        return HttpResponse.json({ watch, created: true }, { status: 201 });
      }),
      http.get('*/api/v1/dota/watchlists', () => HttpResponse.json({ watches: added ? [watch] : [], matches: [] }))
    );
    const user = userEvent.setup();
    await renderSources('/sources');
    await user.click(await screen.findByRole('tab', { name: 'Обновления' }));
    await user.click(await screen.findByRole('link', { name: /Открыть разбор: Patch 7\.41/ }));
    await user.click(await screen.findByRole('button', { name: 'Следить за героем: Axe' }));
    expect(idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(addBody).toEqual({ sourceKey: 'patch_notes', externalId: '7.41', factId: 'hero:axe:armor' });
    expect((await screen.findByRole('tab', { name: 'Обновления' })).getAttribute('aria-selected')).toBe('true');
    await waitFor(() =>
      expect(document.querySelector('[data-watch-id="cc9a09b9-b80a-4b72-b977-6972029fd56a"]')).toBe(
        document.activeElement
      )
    );
  });

  it('does not offer watches for unsupported facts', async () => {
    server.use(
      http.get('*/api/v1/dota/updates/patch_notes/7.41', () =>
        HttpResponse.json({
          ...detail,
          facts: [{ ...detail.facts[0], entityType: 'neutral_item' }]
        })
      )
    );
    await renderSources('/sources?update=patch_notes%3A7.41');
    expect(await screen.findByText('Axe')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Следить за/ })).toBeNull();
  });

  it('keeps the confirmed fact available and reports 409 without claiming it was added', async () => {
    installDefaultHandlers();
    server.use(
      http.get('*/api/v1/dota', () => HttpResponse.json(list)),
      http.post('*/api/v1/dota/watchlists', () =>
        HttpResponse.json({ error: { code: 'CONFLICT', message: 'Conflict' } }, { status: 409 })
      )
    );
    const user = userEvent.setup();
    await renderSources('/sources?update=patch_notes%3A7.41');
    const addButton = await screen.findByRole('button', { name: 'Следить за героем: Axe' });
    await user.click(addButton);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Следить за героем: Axe' })).toBeTruthy();
    expect(screen.queryByText('Уже отслеживается')).toBeNull();
  });

  it('renders parsed facts with one update-level official source link', async () => {
    installDefaultHandlers();
    await renderSources('/sources?update=patch_notes%3A7.41');

    expect(await screen.findByRole('heading', { name: 'Patch 7.41' })).toBeTruthy();
    expect(screen.getByText('Axe')).toBeTruthy();
    expect(screen.getByText('Base armor increased by 1')).toBeTruthy();
    expect(screen.getByText('2 → 3')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Открыть официальный источник/ }).getAttribute('href')).toBe(canonicalUrl);
    expect(document.querySelectorAll(`a[href="${canonicalUrl}"]`)).toHaveLength(1);
    expect(document.querySelectorAll('.fields a')).toHaveLength(0);
  });

  it('shows incomplete and empty parse outcomes without claiming there were no patch changes', async () => {
    server.use(
      http.get('*/api/v1/dota', () => HttpResponse.json(list)),
      http.get('*/api/v1/dota/updates/patch_notes/7.41', () =>
        HttpResponse.json({ ...detail, parseStatus: 'incomplete', facts: [] })
      )
    );
    await renderSources('/sources?update=patch_notes%3A7.41');

    await waitFor(() => expect(document.querySelector('[data-status="incomplete"]')).not.toBeNull());
    expect(screen.getByText(/Показаны только независимо подтверждённые факты/)).toBeTruthy();
    expect(screen.queryByText(/изменений в обновлении нет/i)).toBeNull();
    expect(document.querySelector(`a[href="${canonicalUrl}"]`)).not.toBeNull();
  });

  it('distinguishes no recognized facts from a complete patch with changes', async () => {
    server.use(
      http.get('*/api/v1/dota', () => HttpResponse.json(list)),
      http.get('*/api/v1/dota/updates/patch_notes/7.41', () =>
        HttpResponse.json({ ...detail, parseStatus: 'no_recognized_facts', facts: [] })
      )
    );
    await renderSources('/sources?update=patch_notes%3A7.41');

    expect(await screen.findByRole('heading', { name: 'Подтверждённых изменений не найдено' })).toBeTruthy();
    expect(screen.getByText(/Это не означает, что в обновлении нет изменений/)).toBeTruthy();
  });

  it('retries an unavailable parse only by repeating the safe detail GET', async () => {
    let reads = 0;
    server.use(
      http.get('*/api/v1/dota', () => HttpResponse.json(list)),
      http.get('*/api/v1/dota/updates/patch_notes/7.41', () => {
        reads += 1;
        return HttpResponse.json({ ...detail, parseStatus: 'unavailable', facts: [] });
      })
    );
    await renderSources('/sources?update=patch_notes%3A7.41');

    await userEvent.click(await screen.findByRole('button', { name: 'Повторить чтение' }));
    await waitFor(() => expect(reads).toBe(2));
    expect(screen.getByRole('heading', { name: 'Не удалось подготовить разбор' })).toBeTruthy();
  });

  it('does not expose update details on 403 and offers only safe navigation', async () => {
    server.use(
      http.get('*/api/v1/dota', () => HttpResponse.json(list)),
      http.get('*/api/v1/dota/updates/patch_notes/7.41', () =>
        HttpResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
      )
    );
    await renderSources('/sources?update=patch_notes%3A7.41');

    expect(await screen.findByRole('heading', { name: 'Нет доступа' })).toBeTruthy();
    expect(screen.queryByText('Axe')).toBeNull();
    expect(document.querySelector(`a[href="${canonicalUrl}"]`)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Повторить чтение' })).toBeNull();
    expect(screen.getByRole('link', { name: /К обновлениям/ })).toBeTruthy();
  });

  it('opens by keyboard and restores focus to the exact update link after returning', async () => {
    installDefaultHandlers();
    const user = userEvent.setup();
    const router = await renderSources('/sources');
    await screen.findByText('Официальные источники');
    await user.click(await screen.findByRole('tab', { name: 'Обновления' }));
    const opener = await screen.findByRole('link', { name: 'Открыть разбор: Patch 7.41' });
    opener.focus();
    await user.keyboard('{Enter}');

    await screen.findByRole('heading', { name: 'Patch 7.41' });
    expect(router.state.location.search).toMatchObject({ update: 'patch_notes:7.41' });
    await user.click(screen.getByRole('link', { name: '← К обновлениям' }));
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(router.state.location.search).not.toHaveProperty('update');
  });

  it('keeps list query parameters when opening and returning from detail', async () => {
    installDefaultHandlers();
    const router = await renderSources('/sources?view=updates&q=patch');
    await screen.findByText('Официальные источники');
    await userEvent.click(screen.getByRole('tab', { name: 'Обновления' }));
    const opener = await screen.findByRole('link', { name: 'Открыть разбор: Patch 7.41' });
    await userEvent.click(opener);
    await screen.findByRole('heading', { name: 'Patch 7.41' });
    expect(router.state.location.search).toMatchObject({ view: 'updates', q: 'patch', update: 'patch_notes:7.41' });
    await userEvent.click(screen.getByRole('link', { name: '← К обновлениям' }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ view: 'updates', q: 'patch' }));
  });

  it('clears private query data and redirects to login when detail is still unauthorized after refresh', async () => {
    setSession({ accessToken: 'test-access', expiresAt: '2099-01-01T00:00:00.000Z' });
    const root = createRootRoute({
      component: () => (
        <AuthProvider>
          <Outlet />
        </AuthProvider>
      )
    });
    function ProtectedSources() {
      const auth = useAuth();
      return auth.status === 'anonymous' ? <Navigate to="/login" replace /> : <SourcesPage />;
    }
    const sources = createRoute({
      getParentRoute: () => root,
      path: '/sources',
      validateSearch: (search: Record<string, unknown>) => search,
      component: ProtectedSources
    });
    const login = createRoute({ getParentRoute: () => root, path: '/login', component: () => <h1>Вход</h1> });
    const router = createRouter({
      routeTree: root.addChildren([sources, login]),
      history: createMemoryHistory({ initialEntries: ['/sources?update=patch_notes%3A7.41'] })
    });
    const client = createTestQueryClient();
    let detailReads = 0;
    server.use(
      http.get('*/api/v1/dota', () => HttpResponse.json(list)),
      http.get('*/api/v1/dota/updates/patch_notes/7.41', () => {
        detailReads += 1;
        return HttpResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
      }),
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'refreshed-access', expiresAt: '2099-01-01T00:00:00.000Z' })
      )
    );
    await router.load();
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/login');
    expect(getAccessToken()).toBeNull();
    expect(detailReads).toBe(2);
    await waitFor(() =>
      expect(client.getQueryData(['dota-intelligence', 'detail', 'patch_notes', '7.41'])).toBeUndefined()
    );
  });
});
