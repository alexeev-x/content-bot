import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, ids, post, postPage } from '../../../test/fixtures';
import { failWith, server, setupMswServer } from '../../../test/msw';
import { clearViewport, setViewport } from '../../../test/viewport';
import { onCreate, onOpen, renderList } from './list-harness';
import { formatRelative } from '../model/format-time';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(() => {
  cleanup();
  clearViewport();
});

beforeEach(() => {
  onOpen.mockClear();
  onCreate.mockClear();
});

describe('posts list states', () => {
  it('shows a busy skeleton while loading, then rows without the internal revision', async () => {
    server.use(
      http.get('*/api/v1/posts', () =>
        HttpResponse.json(
          postPage([
            post({ title: 'Герой дня', body: 'Длинный\n\nтекст про героя', revision: 4 }),
            post({ id: ids.post2, title: 'Патч', body: '', status: 'approved' })
          ])
        )
      )
    );
    renderList();
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeTruthy());
    await screen.findByText('Герой дня');
    const table = screen.getByRole('grid', { name: 'Список постов' });
    expect(within(table).getByText('Герой дня')).toBeTruthy();
    expect(within(table).getByText('Длинный текст про героя')).toBeTruthy();
    expect(within(table).getByText('Текст не заполнен')).toBeTruthy();
    expect(within(table).getByText('Черновик')).toBeTruthy();
    expect(within(table).queryByRole('columnheader', { name: /Ревизия/ })).toBeNull();
    expect(within(table).queryByText('ред. 4')).toBeNull();
    expect(table.querySelector('time[datetime][title]')).toBeTruthy();
  });

  it('on a phone draws compact rows with the status beside the title', async () => {
    setViewport(375);
    server.use(
      http.get('*/api/v1/posts', () => HttpResponse.json(postPage([post({ title: 'Герой дня', revision: 4 })])))
    );
    renderList();
    await screen.findByText('Герой дня');
    const list = screen.getByRole('list', { name: 'Список постов' });
    expect(within(list).getByText('Черновик')).toBeTruthy();
    expect(within(list).getByRole('button', { name: /^Герой дня/ })).toBeTruthy();
    expect(within(list).queryByText('ред. 4')).toBeNull();
  });

  it('opens a post from its row with the keyboard', async () => {
    const user = userEvent.setup();
    renderList();
    const open = await screen.findByRole('row', { name: /Заголовок/ });
    open.focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith(ids.post);
  });

  it('offers «Новый пост» when there are no posts at all', async () => {
    const user = userEvent.setup();
    server.use(http.get('*/api/v1/posts', () => HttpResponse.json(postPage([]))));
    renderList();
    expect(await screen.findByText('Постов пока нет')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Новый пост' }));
    expect(onCreate).toHaveBeenCalled();
  });

  it('shows a requestId and a retry for a failed read, and no data for 403', async () => {
    const user = userEvent.setup();
    server.use(failWith('get', '/api/v1/posts', { status: 503, code: 'UNAVAILABLE' }));
    renderList();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('req-test-1');
    server.use(http.get('*/api/v1/posts', () => HttpResponse.json(postPage([post()]))));
    await user.click(within(alert).getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Заголовок')).toBeTruthy();

    cleanup();
    server.use(failWith('get', '/api/v1/posts', { status: 403, code: 'FORBIDDEN' }));
    renderList();
    expect(await screen.findByText('Нет доступа')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull();
  });
});

describe('filter, search and pagination', () => {
  it('requests the tab as view and status, and distinguishes «filters hide everything» from «no data»', async () => {
    const user = userEvent.setup();
    const requests: string[] = [];
    server.use(
      http.get('*/api/v1/posts', ({ request }) => {
        const params = new URL(request.url).searchParams;
        requests.push(`${params.get('view')}/${params.get('status')}`);
        return HttpResponse.json(postPage(params.get('status') ? [] : [post()]));
      })
    );
    renderList();
    await screen.findByRole('grid', { name: 'Список постов' });
    await user.click(screen.getByRole('tab', { name: 'Черновики' }));
    expect(await screen.findByText('Нет постов с такими условиями')).toBeTruthy();
    expect(requests).toEqual(['live/null', 'live/draft']);
    await user.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
    expect(await screen.findByText('Заголовок')).toBeTruthy();
  });

  it('searches the loaded posts only, says so, and loads the next page by cursor', async () => {
    const user = userEvent.setup();
    const cursors: Array<string | null> = [];
    server.use(
      http.get('*/api/v1/posts', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        cursors.push(cursor);
        return cursor === null
          ? HttpResponse.json(
              postPage([post({ title: 'Альфа' }), post({ id: ids.post2, title: 'Бета' })], { nextCursor: 'c2' })
            )
          : HttpResponse.json(postPage([post({ id: '11111111-1111-4111-8111-333333333333', title: 'Гамма' })]));
      })
    );
    renderList();
    await screen.findByText('Альфа');
    await user.click(screen.getByRole('button', { name: 'Поиск по постам' }));
    await user.type(await screen.findByRole('searchbox', { name: 'Название или текст' }), 'бет');
    await user.click(document.body);
    expect(screen.queryByText('Альфа')).toBeNull();
    expect(screen.getByText('Бета')).toBeTruthy();
    expect(screen.getByText(/Поиск идёт только по уже загруженным постам\./)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Показать ещё' }));
    await waitFor(() => expect(cursors).toEqual([null, 'c2']));
    expect(await screen.findByText('Загружено 3 из 3')).toBeTruthy();
  });
});

describe('formatRelative', () => {
  const now = Date.parse('2026-10-06T12:00:00.000Z');
  it('uses minutes, hours and days, and the date after a week', () => {
    expect(formatRelative('2026-10-06T11:59:40.000Z', now)).toBe('только что');
    expect(formatRelative('2026-10-06T11:55:00.000Z', now)).toBe('5 минут назад');
    expect(formatRelative('2026-10-06T09:00:00.000Z', now)).toBe('3 часа назад');
    expect(formatRelative('2026-10-05T11:00:00.000Z', now)).toBe('вчера');
    expect(formatRelative('2026-09-01T12:00:00.000Z', now)).toMatch(/2026/);
  });
});
