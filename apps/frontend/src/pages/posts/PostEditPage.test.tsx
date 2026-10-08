import type { PostDto } from '@alexeev/contracts';
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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../shared/api/session';
import { ToastProvider } from '../../shared/ui';
import { accessToken, archivedPost, ids, post, postWith } from '../../test/fixtures';
import { server, setupMswServer } from '../../test/msw';
import { createTestQueryClient } from '../../test/query-wrapper';
import { PostEditPage } from './PostEditPage';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(cleanup);

async function renderPage() {
  const root = createRootRoute({
    component: () => (
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    )
  });
  const page = createRoute({
    getParentRoute: () => root,
    path: '/posts/$id',
    component: () => <PostEditPage id={ids.post} />
  });
  const list = createRoute({
    getParentRoute: () => root,
    path: '/posts',
    validateSearch: (search: Record<string, unknown>) => search,
    component: () => <h1>Посты</h1>
  });
  const publications = createRoute({
    getParentRoute: () => root,
    path: '/publications',
    validateSearch: (search: Record<string, unknown>) => search,
    component: () => <h1>Публикации</h1>
  });
  const router = createRouter({
    routeTree: root.addChildren([page, list, publications]),
    history: createMemoryHistory({ initialEntries: [`/posts/${ids.post}`] })
  });
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { router, user: userEvent.setup() };
}

function serve(current: () => PostDto) {
  server.use(http.get(`*/api/v1/posts/${ids.post}`, () => HttpResponse.json(current())));
}

describe('archived post page', () => {
  it('is read-only with the archive banner, its date, and no publish action', async () => {
    serve(() => archivedPost({ id: ids.post, title: 'Итоги' }));
    await renderPage();
    expect(await screen.findByText(/Пост в архиве\. Удалится /)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Вернуть из архива' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Удалить сейчас' })).toBeTruthy();
    expect((screen.getByRole('textbox', { name: /Заголовок/ }) as HTMLInputElement).readOnly).toBe(true);
    expect(screen.queryByRole('button', { name: 'Опубликовать' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Действия с постом' })).toBeTruthy();
  });

  it('restores from the banner and then shows a live approved post', async () => {
    let current = archivedPost({ id: ids.post, title: 'Итоги', revision: 3 });
    serve(() => current);
    server.use(
      http.post(`*/api/v1/posts/${ids.post}/restore`, () => {
        current = post({ id: ids.post, title: 'Итоги', status: 'approved', revision: 3 });
        return HttpResponse.json(current);
      })
    );
    const { user } = await renderPage();
    await user.click(await screen.findByRole('button', { name: 'Вернуть из архива' }));
    expect(await screen.findByText('Пост возвращён из архива')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/Пост в архиве\. Удалится /)).toBeNull());
    expect(await screen.findByRole('button', { name: 'Опубликовать' })).toBeTruthy();
  });

  it('deletes now after confirming and returns to the list', async () => {
    serve(() => archivedPost({ id: ids.post, title: 'Итоги' }));
    server.use(
      http.post(`*/api/v1/posts/${ids.post}/delete`, () =>
        HttpResponse.json({ id: ids.post, cancelledPublications: [] })
      )
    );
    const { user, router } = await renderPage();
    await user.click(await screen.findByRole('button', { name: 'Удалить сейчас' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Удалить пост «Итоги»?' });
    expect(within(dialog).getByText(/Сообщения в каналах не удаляются/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/posts'));
    expect(await screen.findByText('Пост «Итоги» удалён')).toBeTruthy();
  });
});

describe('live post page', () => {
  it('offers «Удалить» in the header menu, naming the publications that will be cancelled', async () => {
    serve(() => postWith({ scheduled: 1 }, { id: ids.post, title: 'План' }));
    const { user } = await renderPage();
    await user.click(await screen.findByRole('button', { name: 'Действия с постом' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Удалить пост «План»?' });
    expect(within(dialog).getByText(/Будут отменены запланированные публикации: 1\./)).toBeTruthy();
  });

  it('disables «Удалить» with the reason while a publication is being sent', async () => {
    serve(() => postWith({ sending: 1 }, { id: ids.post, title: 'Идёт' }));
    const { user } = await renderPage();
    await user.click(await screen.findByRole('button', { name: 'Действия с постом' }));
    expect(
      (await screen.findByRole('menuitem', { name: 'Удалить: идёт отправка' })).getAttribute('aria-disabled')
    ).toBe('true');
  });

  it('duplicates the post as a new draft and opens it', async () => {
    serve(() => post({ id: ids.post, title: 'Оригинал', body: 'Текст' }));
    let body: unknown;
    server.use(
      http.post('*/api/v1/posts', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(post({ id: ids.post2, title: 'Оригинал', body: 'Текст' }), { status: 201 });
      })
    );
    const { user, router } = await renderPage();
    await user.click(await screen.findByRole('button', { name: 'Действия с постом' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Дублировать' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/posts/${ids.post2}`));
    expect(body).toMatchObject({ title: 'Оригинал', body: 'Текст' });
    expect(await screen.findByText('Копия сохранена как новый черновик')).toBeTruthy();
  });

  it('opens Publications already filtered to this post', async () => {
    serve(() => post({ id: ids.post, title: 'Оригинал' }));
    const { user, router } = await renderPage();
    await user.click(await screen.findByRole('button', { name: 'Действия с постом' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Открыть публикации' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/publications'));
    expect(router.state.location.search).toMatchObject({ post: ids.post });
  });
});
