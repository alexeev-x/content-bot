import type { PublicationDto } from '@alexeev/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider
} from '@tanstack/react-router';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, setSession } from '../../shared/api/session';
import { ToastProvider } from '../../shared/ui';
import { accessToken, destination, errorBody, ids, post, publication } from '../../test/fixtures';
import { server, setupMswServer } from '../../test/msw';
import { createTestQueryClient } from '../../test/query-wrapper';
import { PublicationsPage } from './PublicationsPage';
import type { PublicationsSearch } from './search';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(() => {
  cleanup();
  restoreVisibility();
});

const OTHER_POST = '11111111-1111-4111-8111-222222222222';
const SECOND_DESTINATION = '22222222-2222-4222-8222-333333333333';

function restoreVisibility() {
  Reflect.deleteProperty(document, 'visibilityState');
  document.dispatchEvent(new Event('visibilitychange'));
}
function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

const rows = {
  scheduled: publication({ id: '33333333-3333-4333-8333-000000000001', status: 'scheduled' }),
  sent: publication({
    id: '33333333-3333-4333-8333-000000000002',
    postId: OTHER_POST,
    status: 'sent',
    externalMessageId: '4821'
  }),
  sentNoId: publication({ id: '33333333-3333-4333-8333-000000000003', status: 'sent' })
};

function servePosts() {
  server.use(
    http.get('*/api/v1/posts/:id', ({ params }) =>
      HttpResponse.json(
        params['id'] === OTHER_POST ? post({ id: OTHER_POST, title: 'Мета недели' }) : post({ title: 'Герой дня' })
      )
    )
  );
}

function serveList(handler: (url: URL, call: number) => { items: PublicationDto[]; nextCursor?: string | null }) {
  const urls: URL[] = [];
  server.use(
    http.get('*/api/v1/publications', ({ request }) => {
      const url = new URL(request.url);
      urls.push(url);
      const page = handler(url, urls.length);
      return HttpResponse.json({ items: page.items, nextCursor: page.nextCursor ?? null });
    })
  );
  return urls;
}

type RenderOptions = { initial?: PublicationsSearch; pollMs?: number; onOpenPosts?: () => void };

async function renderPage(options: RenderOptions = {}) {
  const client = createTestQueryClient();
  function Host() {
    const [search, setSearch] = useState<PublicationsSearch>(options.initial ?? {});
    return (
      <PublicationsPage
        search={search}
        onSearchChange={(patch) => setSearch((previous) => ({ ...previous, ...patch }))}
        onOpenPosts={options.onOpenPosts ?? (() => undefined)}
        {...(options.pollMs ? { pollMs: options.pollMs } : {})}
      />
    );
  }
  const root = createRootRoute({
    component: () => (
      <ToastProvider>
        <Host />
        <Outlet />
      </ToastProvider>
    )
  });
  const stub = (path: string) => createRoute({ getParentRoute: () => root, path, component: () => null });
  const router = createRouter({
    routeTree: root.addChildren([stub('/'), stub('/posts/$id')]),
    history: createMemoryHistory({ initialEntries: ['/'] })
  });
  await router.load();
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { user: userEvent.setup(), view, client };
}

describe('PublicationsPage list', () => {
  it('shows status pill, post title, channel, time and a Telegram link only for a confirmed send', async () => {
    servePosts();
    server.use(
      http.get('*/api/v1/destinations', () =>
        HttpResponse.json({ items: [destination({ chatId: '@alexeev_chan' })], nextCursor: null })
      )
    );
    serveList(() => ({ items: [rows.scheduled, rows.sent, rows.sentNoId] }));
    await renderPage();

    const table = await screen.findByRole('grid', { name: 'Список публикаций' });
    expect((await within(table).findAllByText('Герой дня')).length).toBe(2);
    expect(await within(table).findByText('Мета недели')).toBeTruthy();
    expect(within(table).getAllByText('Канал').length).toBeGreaterThan(0);
    const link = within(table).getByRole('link', { name: 'Сообщение 4821 в Telegram' });
    expect(link.getAttribute('href')).toBe('https://t.me/alexeev_chan/4821');
    // «Опубликовано» is the confirmed row only; the bare sent reads as needing a check.
    expect(within(table).getAllByText('Опубликовано')).toHaveLength(1);
    expect(within(table).getAllByText('Требует проверки')).toHaveLength(1);
    expect(within(table).getByText('Запланировано')).toBeTruthy();
  });

  it('shows the operator time zone with its offset above the list', async () => {
    serveList(() => ({ items: [rows.scheduled] }));
    await renderPage();
    expect(await screen.findByText(/Время в вашем часовом поясе: .+ \(UTC/)).toBeTruthy();
  });

  it('puts status and channel filters into the search, resets the cursor and can clear them', async () => {
    server.use(
      http.get('*/api/v1/destinations', () =>
        HttpResponse.json({
          items: [destination(), destination({ id: SECOND_DESTINATION, title: 'Новости' })],
          nextCursor: null
        })
      )
    );
    const urls = serveList(() => ({ items: [rows.scheduled] }));
    servePosts();
    const { user } = await renderPage({ initial: { cursor: 'abc' } });
    await screen.findByRole('grid', { name: 'Список публикаций' });
    expect(urls.at(-1)?.searchParams.get('cursor')).toBe('abc');

    await user.click(screen.getByRole('button', { name: /Статус/ }));
    await user.click(await screen.findByRole('option', { name: 'Ошибка' }));
    await waitFor(() => expect(urls.at(-1)?.searchParams.get('status')).toBe('failed'));
    expect(urls.at(-1)?.searchParams.get('cursor')).toBeNull();

    await user.click(screen.getByRole('button', { name: /Канал/ }));
    await user.click(await screen.findByRole('option', { name: 'Новости' }));
    await waitFor(() => expect(urls.at(-1)?.searchParams.get('destinationId')).toBe(SECOND_DESTINATION));
    expect(urls.at(-1)?.searchParams.get('status')).toBe('failed');

    await user.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
    await waitFor(() => expect(urls.at(-1)?.searchParams.get('status')).toBeNull());
    expect(urls.at(-1)?.searchParams.get('destinationId')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Сбросить фильтры' })).toBeNull();
  });

  it('pages with the opaque cursor and returns to the start', async () => {
    servePosts();
    const urls = serveList((url) =>
      url.searchParams.get('cursor') === 'next-1'
        ? { items: [rows.sent] }
        : { items: [rows.scheduled], nextCursor: 'next-1' }
    );
    const { user } = await renderPage();
    await user.click(await screen.findByRole('button', { name: 'Дальше' }));
    await waitFor(() => expect(urls.at(-1)?.searchParams.get('cursor')).toBe('next-1'));
    expect(await screen.findByText('Мета недели')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Дальше' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'К началу списка' }));
    // The first page is served from the cache, so the proof is on screen, not in a new request.
    expect(await screen.findByRole('button', { name: 'Дальше' })).toBeTruthy();
    expect(screen.getByText('Герой дня')).toBeTruthy();
  });

  it('distinguishes «no publications yet» from «filters hide everything»', async () => {
    serveList(() => ({ items: [] }));
    const onOpenPosts = vi.fn();
    const { user, view } = await renderPage({ onOpenPosts });
    expect(await screen.findByText('Публикаций пока нет')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'К постам' }));
    expect(onOpenPosts).toHaveBeenCalled();
    view.unmount();
    cleanup();

    await renderPage({ initial: { status: 'failed' } });
    expect(await screen.findByText('Ничего не найдено')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Сбросить фильтры' }).length).toBeGreaterThan(0);
  });

  it('shows a skeleton busy region while loading, then an error with the request id and a safe retry', async () => {
    let attempt = 0;
    server.use(
      http.get('*/api/v1/publications', () => {
        attempt += 1;
        return attempt <= 1
          ? HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 })
          : HttpResponse.json({ items: [rows.scheduled], nextCursor: null });
      })
    );
    servePosts();
    const { user, view } = await renderPage();
    expect(view.container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(await screen.findByText('Не удалось загрузить публикации')).toBeTruthy();
    expect(screen.getByText(/req-test-1/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('grid', { name: 'Список публикаций' })).toBeTruthy();
  });

  it('shows «Нет доступа» without data for 403', async () => {
    server.use(http.get('*/api/v1/publications', () => HttpResponse.json(errorBody('FORBIDDEN'), { status: 403 })));
    await renderPage();
    expect(await screen.findByText('Нет доступа')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull();
    expect(screen.queryByRole('grid')).toBeNull();
  });
});

describe('PublicationsPage polling', () => {
  const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it('polls while a visible row is in progress and stops once every row is final', async () => {
    servePosts();
    const urls = serveList((_url, call) => ({
      items: [call < 3 ? rows.scheduled : { ...rows.scheduled, status: 'sent', externalMessageId: '5' }]
    }));
    await renderPage({ pollMs: 40 });
    await waitFor(() => expect(urls.length).toBeGreaterThanOrEqual(3), { timeout: 2000 });
    await settle(60);
    const settled = urls.length;
    await settle(250);
    expect(urls.length).toBe(settled);
  });

  it('does not poll a list that is already final', async () => {
    servePosts();
    const urls = serveList(() => ({ items: [rows.sent] }));
    await renderPage({ pollMs: 30 });
    await screen.findByText('Мета недели');
    await settle(200);
    expect(urls).toHaveLength(1);
  });

  it('stops while the tab is hidden and resumes when it is visible again', async () => {
    servePosts();
    const urls = serveList(() => ({ items: [rows.scheduled] }));
    await renderPage({ pollMs: 40 });
    await waitFor(() => expect(urls.length).toBeGreaterThanOrEqual(2), { timeout: 2000 });

    setVisibility('hidden');
    await settle(80);
    const hiddenAt = urls.length;
    await settle(300);
    expect(urls.length).toBe(hiddenAt);

    setVisibility('visible');
    await waitFor(() => expect(urls.length).toBeGreaterThan(hiddenAt), { timeout: 2000 });
  });

  it('stops when the page unmounts', async () => {
    servePosts();
    const urls = serveList(() => ({ items: [rows.scheduled] }));
    const { view } = await renderPage({ pollMs: 40 });
    await waitFor(() => expect(urls.length).toBeGreaterThanOrEqual(2), { timeout: 2000 });
    view.unmount();
    await settle(80);
    const stopped = urls.length;
    await settle(300);
    expect(urls.length).toBe(stopped);
  });
});

describe('PublicationsPage drawer', () => {
  it('opens the detail drawer from a row, keeps the id in the search and closes with Esc', async () => {
    servePosts();
    serveList(() => ({ items: [rows.scheduled] }));
    server.use(http.get('*/api/v1/publications/:id', () => HttpResponse.json(rows.scheduled)));
    const { user } = await renderPage();
    await user.click(await screen.findByRole('row', { name: /Герой дня/ }));
    const drawer = await screen.findByRole('dialog', { name: 'Герой дня' });
    expect(within(drawer).getByRole('list', { name: 'Этапы публикации' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Герой дня' })).toBeNull());
  });

  it('opens straight from a shared link with the id in the search', async () => {
    servePosts();
    serveList(() => ({ items: [] }));
    server.use(http.get('*/api/v1/publications/:id', () => HttpResponse.json(rows.sentNoId)));
    await renderPage({ initial: { id: ids.publication } });
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText('Нет подтверждения от Telegram')).toBeTruthy();
  });

  it('opens a row with the keyboard', async () => {
    servePosts();
    serveList(() => ({ items: [rows.scheduled] }));
    server.use(http.get('*/api/v1/publications/:id', () => HttpResponse.json(rows.scheduled)));
    const { user } = await renderPage();
    const row = await screen.findByRole('row', { name: /Герой дня/ });
    row.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Герой дня' })).toBeTruthy();
  });
});
