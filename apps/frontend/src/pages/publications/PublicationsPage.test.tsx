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
import { accessToken, destination, errorBody, ids, post, postPage, publication } from '../../test/fixtures';
import { server, setupMswServer } from '../../test/msw';
import { createTestQueryClient } from '../../test/query-wrapper';
import { clearViewport, setViewport } from '../../test/viewport';
import { PublicationsPage } from './PublicationsPage';
import { publicationsSearchSchema, type PublicationsSearch } from './search';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(() => {
  cleanup();
  restoreVisibility();
  clearViewport();
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

type RenderOptions = {
  initial?: PublicationsSearch;
  pollMs?: number;
  onOpenPosts?: () => void;
};

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

  it('shows the operator time zone with its offset in the panel header', async () => {
    serveList(() => ({ items: [rows.scheduled] }));
    await renderPage();
    expect(await screen.findByText(/, UTC/)).toBeTruthy();
  });

  it('searches the loaded rows by post, status label and channel while typing, without a request per keystroke', async () => {
    server.use(
      http.get('*/api/v1/destinations', () =>
        HttpResponse.json({
          items: [destination(), destination({ id: SECOND_DESTINATION, title: 'Новости' })],
          nextCursor: null
        })
      )
    );
    const urls = serveList(() => ({
      items: [rows.scheduled, { ...rows.sent, destinationId: SECOND_DESTINATION }]
    }));
    servePosts();
    const { user } = await renderPage();
    const table = await screen.findByRole('grid', { name: 'Список публикаций' });
    await within(table).findByText('Мета недели');
    await within(table).findByText('Новости');
    const requests = urls.length;
    const field = screen.getByRole('searchbox', { name: 'Поиск по загруженным публикациям' });

    // By post title, ignoring case.
    await user.type(field, 'МЕТА');
    expect(within(table).queryByText('Герой дня')).toBeNull();
    expect(within(table).getByText('Мета недели')).toBeTruthy();

    // By the status label the owner sees.
    await user.clear(field);
    await user.type(field, 'запланировано');
    expect(within(table).getByText('Герой дня')).toBeTruthy();
    expect(within(table).queryByText('Мета недели')).toBeNull();

    // By channel name.
    await user.clear(field);
    await user.type(field, 'новости');
    expect(within(table).queryByText('Герой дня')).toBeNull();
    expect(within(table).getByText('Мета недели')).toBeTruthy();

    expect(urls.length).toBe(requests);
    expect(urls.every((url) => !url.searchParams.has('q'))).toBe(true);
  });

  it('moves into the rows with Arrow Down, shows «Ничего не найдено» with a way back, and clearing restores the rows', async () => {
    serveList(() => ({ items: [rows.scheduled, rows.sent] }));
    servePosts();
    const { user } = await renderPage();
    const table = await screen.findByRole('grid', { name: 'Список публикаций' });
    await within(table).findByText('Мета недели');
    const field = screen.getByRole('searchbox', { name: 'Поиск по загруженным публикациям' });

    await user.click(field);
    await user.keyboard('{ArrowDown}');
    //
    // Real focus moves into the first row, so Enter opens it and the arrows walk the rows.
    expect(document.activeElement?.getAttribute('role')).toBe('row');
    expect(document.activeElement?.textContent).toContain('Герой дня');

    await user.type(field, 'такого нет');
    expect(await screen.findByText('Ничего не найдено')).toBeTruthy();
    // The field's own clear button has the same name; the empty state's button comes last.
    await user.click(screen.getAllByRole('button', { name: 'Очистить поиск' }).at(-1) as HTMLElement);
    expect(await screen.findByRole('grid', { name: 'Список публикаций' })).toBeTruthy();
    expect(screen.getByText('Герой дня')).toBeTruthy();
    expect(screen.getByText('Мета недели')).toBeTruthy();
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');

    // Esc clears the text.
    await user.type(screen.getByRole('searchbox'), 'мета');
    expect(screen.queryByText('Герой дня')).toBeNull();
    await user.keyboard('{Escape}');
    expect(await screen.findByText('Герой дня')).toBeTruthy();
  });

  it('sorts by time from the column header', async () => {
    servePosts();
    const urls = serveList(() => ({ items: [rows.scheduled] }));
    const { user } = await renderPage();
    await user.click(await screen.findByRole('columnheader', { name: /Время/ }));
    await waitFor(() => expect(urls.at(-1)?.searchParams.get('order')).toBe('asc'));
  });

  it('switches tabs, which map to the server status', async () => {
    servePosts();
    const urls = serveList(() => ({ items: [rows.scheduled] }));
    const { user } = await renderPage();
    await screen.findByRole('grid', { name: 'Список публикаций' });
    await user.click(screen.getByRole('tab', { name: 'Ошибки' }));
    await waitFor(() => expect(urls.at(-1)?.searchParams.get('status')).toBe('failed'));
    expect(screen.getByRole('tab', { name: 'Ошибки' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('tab', { name: 'Сегодня' })).toBeNull();
  });

  it('maps the URL presets to server-side publication filters', async () => {
    servePosts();
    const urls = serveList(() => ({ items: [rows.scheduled] }));

    const recent = await renderPage({ initial: { view: 'recent' } });
    await screen.findByRole('grid', { name: 'Список публикаций' });
    expect(urls.at(-1)?.searchParams.get('status')).toBe('sent');
    expect(urls.at(-1)?.searchParams.get('order')).toBe('desc');
    recent.view.unmount();
    cleanup();

    const upcoming = await renderPage({ initial: { view: 'upcoming' } });
    await screen.findByRole('grid', { name: 'Список публикаций' });
    expect(urls.at(-1)?.searchParams.get('status')).toBe('scheduled');
    expect(urls.at(-1)?.searchParams.get('order')).toBe('asc');
    upcoming.view.unmount();
    cleanup();

    const errors = await renderPage({ initial: { view: 'errors' } });
    await screen.findByRole('grid', { name: 'Список публикаций' });
    expect(urls.at(-1)?.searchParams.get('status')).toBe('failed');
    errors.view.unmount();
    cleanup();
  });

  it('opens an old ?view=today link as «Все»', () => {
    expect(publicationsSearchSchema.parse({ view: 'today' }).view).toBeUndefined();
    expect(publicationsSearchSchema.parse({ view: 'bogus' }).view).toBeUndefined();
  });

  it('opens old ?status=, ?channel= and ?q= links without a crash and without sending them to the server', async () => {
    const old = publicationsSearchSchema.parse({ status: 'failed', channel: 'nope', q: 'мета', order: 'asc' });
    expect(old).toEqual({ order: 'asc' });
    servePosts();
    const urls = serveList(() => ({ items: [rows.scheduled] }));
    await renderPage({ initial: old });
    expect(await screen.findByRole('grid', { name: 'Список публикаций' })).toBeTruthy();
    const url = urls.at(-1);
    expect(url?.searchParams.has('status')).toBe(false);
    expect(url?.searchParams.has('q')).toBe(false);
    expect(url?.searchParams.has('destinationId')).toBe(false);
  });

  it('on a phone searches the cards with the same text and keeps only the sort in the sheet', async () => {
    setViewport(375);
    const urls = serveList(() => ({ items: [rows.scheduled, rows.sent] }));
    servePosts();
    const { user } = await renderPage();
    expect(await screen.findByRole('button', { name: /^Герой дня/ })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /^Мета недели/ })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Список публикаций' })).toBeTruthy();
    const requests = urls.length;

    await user.type(screen.getByRole('searchbox', { name: 'Поиск по загруженным публикациям' }), 'опубликовано');
    expect(screen.queryByRole('button', { name: /^Герой дня/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Мета недели/ })).toBeTruthy();
    expect(urls.length).toBe(requests);

    await user.click(screen.getByRole('button', { name: /^Сортировка/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Сортировка' });
    expect(within(sheet).queryByRole('button', { name: /Статус|Канал/ })).toBeNull();
    await user.click(within(sheet).getByRole('button', { name: /Сортировка/ }));
    await user.click(await screen.findByRole('option', { name: 'Сначала старые' }));
    await user.click(within(sheet).getByRole('button', { name: 'Показать результаты' }));
    await waitFor(() => expect(urls.at(-1)?.searchParams.get('order')).toBe('asc'));
  });

  it('loads the next page by cursor under «Показать ещё» and keeps the loaded rows', async () => {
    servePosts();
    const urls = serveList((url) =>
      url.searchParams.get('cursor') === 'next-1'
        ? { items: [rows.sent] }
        : { items: [rows.scheduled], nextCursor: 'next-1' }
    );
    const { user } = await renderPage();
    expect(await screen.findByText(/^Загружено 1/)).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: 'Показать ещё' }));
    await waitFor(() => expect(urls.at(-1)?.searchParams.get('cursor')).toBe('next-1'));
    expect(await screen.findByText('Мета недели')).toBeTruthy();
    expect(screen.getByText('Герой дня')).toBeTruthy();
    expect(await screen.findByText(/^Загружено 2 из 2/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull();
  });

  it('«Опубликовать пост» offers approved posts, then opens the publish dialog', async () => {
    server.use(
      http.get('*/api/v1/posts', ({ request }) =>
        HttpResponse.json(
          postPage(new URL(request.url).searchParams.get('status') === 'approved' ? [post({ status: 'approved' })] : [])
        )
      ),
      http.get('*/api/v1/destinations', () => HttpResponse.json({ items: [destination()], nextCursor: null }))
    );
    serveList(() => ({ items: [rows.scheduled] }));
    servePosts();
    const { user } = await renderPage();
    await user.click(await screen.findByRole('button', { name: 'Опубликовать пост' }));
    const picker = await screen.findByRole('dialog', { name: 'Какой пост опубликовать?' });
    expect(within(picker).getByRole('button', { name: 'Дальше' }).hasAttribute('disabled')).toBe(true);
    await user.click(await within(picker).findByRole('button', { name: /Пост/ }));
    await user.click(await screen.findByRole('option', { name: 'Заголовок' }));
    await user.click(within(picker).getByRole('button', { name: 'Дальше' }));
    expect(await screen.findByRole('dialog', { name: 'Опубликовать пост' })).toBeTruthy();
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

    await renderPage({ initial: { view: 'errors' } });
    expect(await screen.findByText('Ничего не найдено')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Показать все публикации' }).length).toBeGreaterThan(0);
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
