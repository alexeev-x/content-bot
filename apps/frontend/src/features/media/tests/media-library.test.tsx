import type { MediaLibraryItemDto } from '@alexeev/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { ToastProvider } from '../../../shared/ui';
import { accessToken, ids, post, postPage } from '../../../test/fixtures';
import { failWith, server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { MediaLibrary } from '../ui/MediaLibrary';

setupMswServer();
afterEach(cleanup);
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});

const item: MediaLibraryItemDto = {
  id: '10000000-0000-4000-8000-000000000099',
  kind: 'photo',
  fileName: 'saved-cover.jpg',
  contentType: 'image/jpeg',
  sizeBytes: 200_000,
  width: 1200,
  height: 800,
  durationMs: null,
  createdAt: '2026-10-10T12:00:00.000Z',
  duplicateCount: 2,
  usageCount: 1,
  usages: [{ postId: ids.post, title: 'Черновик с обложкой' }]
};

function mount() {
  const client = createTestQueryClient();
  const navigation = vi.fn();
  const onCreatePost = vi.fn();
  const onLogin = vi.fn();
  const onOpenPost = vi.fn();
  function Harness() {
    const [search, setSearch] = useState({});
    return (
      <MediaLibrary
        searchState={search}
        onSearchState={(patch) => {
          navigation(patch);
          setSearch((current) => ({ ...current, ...patch }));
        }}
        onCreatePost={onCreatePost}
        onLogin={onLogin}
        onOpenPost={onOpenPost}
      />
    );
  }
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <Harness />
      </ToastProvider>
    </QueryClientProvider>
  );
  return { ...view, client, navigation, onCreatePost, onLogin, onOpenPost };
}

function mediaResponse(items: MediaLibraryItemDto[] = [item]) {
  return { items, nextCursor: null };
}

describe('media library', () => {
  it('shows server-backed media, private preview and metadata in the inspector', async () => {
    const contentRequests: string[] = [];
    server.use(
      http.get('*/api/v1/media', () => HttpResponse.json(mediaResponse())),
      http.get('*/api/v1/media/:id/content', ({ params }) => {
        contentRequests.push(String(params['id']));
        return new HttpResponse(new Blob(['private image bytes'], { type: 'image/jpeg' }), {
          headers: { 'Content-Type': 'image/jpeg' }
        });
      })
    );
    const user = userEvent.setup();
    const { unmount } = mount();
    await user.click(await screen.findByRole('button', { name: /saved-cover\.jpg/ }));
    const drawer = await screen.findByRole('dialog', { name: /saved-cover\.jpg/ });
    expect(within(drawer).getByText('Совпадения по содержимому')).toBeTruthy();
    expect(within(drawer).getByText('Используется в постах')).toBeTruthy();
    expect(within(drawer).getByText('Черновик с обложкой')).toBeTruthy();
    await waitFor(() => expect(contentRequests).toContain(item.id));
    expect(contentRequests.every((id) => id === item.id)).toBe(true);
    unmount();
  });

  it('retains the selected media on 409 and offers a safe draft reload', async () => {
    let attachCalls = 0;
    let draftReads = 0;
    server.use(
      http.get('*/api/v1/media', () => HttpResponse.json(mediaResponse())),
      http.get('*/api/v1/media/:id/content', () => new HttpResponse(new Blob(['bytes'], { type: 'image/jpeg' }))),
      http.get('*/api/v1/posts', () => HttpResponse.json(postPage([post({ id: ids.post, title: 'Черновик' })]))),
      http.get(`*/api/v1/posts/${ids.post}`, async () => {
        draftReads += 1;
        if (draftReads > 1) await delay(30);
        return HttpResponse.json(post({ id: ids.post, title: 'Черновик' }));
      }),
      http.post(`*/api/v1/posts/${ids.post}/media/attach`, async () => {
        attachCalls += 1;
        await delay(30);
        return HttpResponse.json(
          { error: { code: 'CONFLICT', message: 'Revision conflict', requestId: 'req-media-conflict' } },
          { status: 409 }
        );
      })
    );
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('checkbox', { name: 'Выбрать saved-cover.jpg' }));
    await user.click(screen.getByRole('button', { name: 'Добавить в пост' }));
    const dialog = await screen.findByRole('dialog', { name: 'Выберите черновик' });
    await user.click(await within(dialog).findByRole('button', { name: /Черновик/ }));
    const submit = within(dialog).getByRole('button', { name: 'Добавить в черновик' });
    await user.click(submit);
    expect((await within(dialog).findByRole('status')).textContent).toContain('Добавляем файлы в черновик…');
    expect(submit.hasAttribute('disabled')).toBe(true);
    expect(await within(dialog).findByText(/Черновик изменился/)).toBeTruthy();
    expect(within(dialog).getByRole('alert').textContent).toContain('req-media-conflict');
    const refresh = within(dialog).getByRole('button', { name: 'Обновить черновик' });
    await user.click(refresh);
    expect((await within(dialog).findByRole('status')).textContent).toContain('Обновляем черновик…');
    expect(refresh.hasAttribute('disabled')).toBe(true);
    await waitFor(() => expect(attachCalls).toBe(1));
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    expect(screen.getByRole('toolbar', { name: 'Выбранные файлы' })).toBeTruthy();
  });

  it('keeps the private-preview retry available to assistive technology', async () => {
    let contentRequests = 0;
    server.use(
      http.get('*/api/v1/media', () => HttpResponse.json(mediaResponse())),
      http.get('*/api/v1/media/:id/content', () => {
        contentRequests += 1;
        return HttpResponse.json({ error: { code: 'UNAVAILABLE', message: 'Unavailable' } }, { status: 503 });
      })
    );
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: /saved-cover\.jpg/ }));
    const dialog = await screen.findByRole('dialog', { name: /saved-cover\.jpg/ });
    const retry = await within(dialog).findByRole('button', { name: 'Повторить' });

    const requestsBeforeRetry = contentRequests;
    await user.click(retry);
    await waitFor(() => expect(contentRequests).toBeGreaterThan(requestsBeforeRetry));
  });

  it('announces media pagination progress and prevents duplicate requests', async () => {
    let listCalls = 0;
    server.use(
      http.get('*/api/v1/media', async ({ request }) => {
        listCalls += 1;
        if (new URL(request.url).searchParams.has('cursor')) {
          await delay(30);
          return HttpResponse.json(
            mediaResponse([{ ...item, id: '20000000-0000-4000-8000-000000000099', fileName: 'next.jpg' }])
          );
        }
        return HttpResponse.json({ ...mediaResponse(), nextCursor: 'media-next' });
      }),
      http.get('*/api/v1/media/:id/content', () => new HttpResponse(new Blob(['bytes'], { type: 'image/jpeg' })))
    );
    const user = userEvent.setup();
    mount();
    const next = await screen.findByRole('button', { name: 'Показать ещё' });
    await user.click(next);
    await waitFor(() => {
      expect(screen.getAllByRole('status').some((status) => status.textContent?.includes('Загружаем ещё файлы…'))).toBe(
        true
      );
    });
    expect(next.hasAttribute('disabled')).toBe(true);
    expect(await screen.findByRole('button', { name: /next\.jpg/ })).toBeTruthy();
    expect(listCalls).toBe(2);
  });

  it('shows no private metadata when the server refuses access', async () => {
    server.use(failWith('get', '/api/v1/media', { status: 403, code: 'FORBIDDEN' }));
    mount();
    expect(await screen.findByText('Нет доступа')).toBeTruthy();
    expect(screen.queryByText('saved-cover.jpg')).toBeNull();
  });

  it('offers login after 401 without exposing library data', async () => {
    server.use(failWith('get', '/api/v1/media', { status: 401, code: 'UNAUTHORIZED' }));
    const user = userEvent.setup();
    const { onLogin } = mount();
    expect(await screen.findByText('Сеанс завершён')).toBeTruthy();
    expect(screen.queryByText('saved-cover.jpg')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Перейти ко входу' }));
    expect(onLogin).toHaveBeenCalledOnce();
  });

  it('distinguishes a truly empty library from a filtered-empty result', async () => {
    server.use(http.get('*/api/v1/media', () => HttpResponse.json(mediaResponse([]))));
    const { onCreatePost, unmount } = mount();
    expect(await screen.findByText('Файлов пока нет')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Создать пост' })).toHaveLength(2);
    expect(onCreatePost).not.toHaveBeenCalled();
    unmount();

    server.use(
      http.get('*/api/v1/media', ({ request }) => {
        expect(new URL(request.url).searchParams.get('search')).toBe('missing');
        return HttpResponse.json(mediaResponse([]));
      })
    );
    const user = userEvent.setup();
    const result = mount();
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по имени файла' }), 'missing');
    expect(await screen.findByText('Ничего не найдено')).toBeTruthy();
    expect(result.navigation).toHaveBeenCalledWith({ search: 'missing', id: undefined });
    expect(screen.getByRole('button', { name: 'Сбросить фильтры' })).toBeTruthy();
  });

  it('safely retries a list error and keeps selected IDs when filters change', async () => {
    let calls = 0;
    server.use(
      http.get('*/api/v1/media', ({ request }) => {
        calls += 1;
        if (calls === 1)
          return HttpResponse.json(
            { error: { code: 'UNAVAILABLE', message: 'Unavailable', requestId: 'req-media-list' } },
            { status: 503 }
          );
        const url = new URL(request.url);
        if (url.searchParams.has('search')) return HttpResponse.json(mediaResponse([]));
        return HttpResponse.json(mediaResponse());
      }),
      http.get('*/api/v1/media/:id/content', () => new HttpResponse(new Blob(['bytes'], { type: 'image/jpeg' })))
    );
    const user = userEvent.setup();
    const mounted = mount();
    expect(await screen.findByText('req-media-list')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Выбрать saved-cover.jpg' }));
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по имени файла' }), 'missing');
    expect(await screen.findByText('Ничего не найдено')).toBeTruthy();
    expect(screen.getByRole('toolbar', { name: 'Выбранные файлы' })).toBeTruthy();
    expect(mounted.navigation).toHaveBeenCalledWith({ search: 'missing', id: undefined });
    expect(calls).toBe(3);
  });

  it('records kind tab changes in route search', async () => {
    server.use(http.get('*/api/v1/media', () => HttpResponse.json(mediaResponse())));
    const user = userEvent.setup();
    const mounted = mount();
    await screen.findByRole('button', { name: /saved-cover\.jpg/ });
    await user.click(screen.getByRole('tab', { name: 'Фото' }));
    expect(mounted.navigation).toHaveBeenCalledWith({ kind: 'photo', id: undefined });
  });
});
