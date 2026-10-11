import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, ids, post, postPage, postWith } from '../../../test/fixtures';
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
  it('returns an eligible approved post to draft with its current revision and keeps row focus', async () => {
    const user = userEvent.setup();
    let current = postWith({}, { title: 'Одобренный пост', revision: 7 });
    let sentBody: unknown;
    server.use(
      http.get('*/api/v1/posts', () => HttpResponse.json(postPage([current]))),
      http.post('*/api/v1/posts/:id/draft', async ({ request }) => {
        sentBody = await request.json();
        current = { ...current, status: 'draft', revision: 8 };
        return HttpResponse.json(current);
      })
    );
    renderList();
    await screen.findByText('Одобренный пост');
    await user.click(screen.getByRole('button', { name: 'Действия с постом «Одобренный пост»' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Вернуть в черновик' }));

    expect(sentBody).toEqual({ revision: 7 });
    expect(await screen.findByText('Пост возвращён в черновик')).toBeTruthy();
    const row = screen.getByRole('row', { name: /Одобренный пост/ });
    await waitFor(() => expect(document.activeElement).toBe(row));
    expect(within(row).getByText('Черновик')).toBeTruthy();
  });

  it('only offers return-to-draft for approved posts and explains publication blockers', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/posts', () =>
        HttpResponse.json(
          postPage([
            postWith({ scheduled: 1 }, { title: 'Ожидает', id: ids.post }),
            postWith({ sending: 1 }, { title: 'Отправляется', id: ids.post2 }),
            postWith({ unknown: 1 }, { title: 'Нужна сверка', id: '11111111-1111-4111-8111-333333333333' }),
            post({ title: 'Черновик', status: 'draft', id: '11111111-1111-4111-8111-444444444444' })
          ])
        )
      )
    );
    renderList();
    await screen.findByText('Ожидает');
    for (const [title, reason] of [
      ['Ожидает', 'есть ожидающая публикация'],
      ['Отправляется', 'идёт отправка'],
      ['Нужна сверка', 'сначала сверьте результат']
    ]) {
      await user.click(screen.getByRole('button', { name: `Действия с постом «${title}»` }));
      expect(
        (await screen.findByRole('menuitem', { name: new RegExp(`Вернуть в черновик: ${reason}`) })).getAttribute(
          'aria-disabled'
        )
      ).toBe('true');
      await user.keyboard('{Escape}');
    }
    await user.click(screen.getByRole('button', { name: 'Действия с постом «Черновик»' }));
    expect(screen.queryByRole('menuitem', { name: /Вернуть в черновик/ })).toBeNull();
  });

  it('refreshes server state after a 409 and announces a recoverable HTTP error', async () => {
    const user = userEvent.setup();
    let gets = 0;
    server.use(
      http.get('*/api/v1/posts', () => {
        gets += 1;
        return HttpResponse.json(postPage([postWith({}, { title: 'Одобренный пост' })]));
      }),
      http.post('*/api/v1/posts/:id/draft', () =>
        HttpResponse.json(
          {
            error: {
              code: 'CONFLICT',
              message: 'Conflict',
              requestId: 'req-conflict',
              details: { reason: 'STALE_REVISION' }
            }
          },
          { status: 409 }
        )
      )
    );
    renderList();
    await screen.findByText('Одобренный пост');
    await user.click(screen.getByRole('button', { name: 'Действия с постом «Одобренный пост»' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Вернуть в черновик' }));
    expect(await screen.findByText('Состояние поста изменилось')).toBeTruthy();
    await waitFor(() => expect(gets).toBeGreaterThan(1));

    cleanup();
    server.use(
      http.get('*/api/v1/posts', () => HttpResponse.json(postPage([postWith({}, { title: 'Одобренный пост' })]))),
      failWith('post', '/api/v1/posts/:id/draft', { status: 503, code: 'UNAVAILABLE' })
    );
    renderList();
    await screen.findByText('Одобренный пост');
    await user.click(screen.getByRole('button', { name: 'Действия с постом «Одобренный пост»' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Вернуть в черновик' }));
    expect(await screen.findByText('Не удалось вернуть в черновик')).toBeTruthy();
    expect(screen.getByText('req-test-1')).toBeTruthy();
  });

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
    expect(await screen.findByText('В этом разделе постов нет')).toBeTruthy();
    expect(requests).toEqual(['live/null', 'live/draft']);
    await user.click(screen.getByRole('button', { name: 'Показать все посты' }));
    expect(await screen.findByText('Заголовок')).toBeTruthy();
  });

  it('loads the next page and starts a fresh server query when search changes', async () => {
    const user = userEvent.setup();
    const requests: URL[] = [];
    server.use(
      http.get('*/api/v1/posts', ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        if (url.searchParams.get('q') === 'бета')
          return HttpResponse.json(postPage([post({ title: 'Бета' })], { totalCount: 1 }));
        return url.searchParams.has('cursor')
          ? HttpResponse.json(
              postPage([post({ id: '11111111-1111-4111-8111-333333333333', title: 'Гамма' })], { totalCount: 3 })
            )
          : HttpResponse.json(
              postPage([post({ title: 'Альфа' }), post({ id: ids.post2, title: 'Бета' })], {
                nextCursor: 'c2',
                totalCount: 3
              })
            );
      })
    );
    renderList();
    await screen.findByText('Альфа');
    expect(screen.getByText('Загружено 2 из 3')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Показать ещё' }));
    await screen.findByText('Гамма');
    const field = screen.getByRole('searchbox', { name: 'Поиск по постам' });
    await user.type(field, 'бета');
    await screen.findByText('Бета');
    await waitFor(() => expect(requests.some((url) => url.searchParams.get('q') === 'бета')).toBe(true));
    const filtered = requests.find((url) => url.searchParams.get('q') === 'бета');
    expect(filtered?.searchParams.has('cursor')).toBe(false);
    expect(screen.getByText('Загружено 1 из 1')).toBeTruthy();
    expect(screen.queryByText('Альфа')).toBeNull();
  });
});

describe('search', () => {
  const mixed = (onRequest?: (url: string) => void) =>
    http.get('*/api/v1/posts', ({ request }) => {
      onRequest?.(request.url);
      const items = [
        post({ title: 'Черновик А', body: 'Про героя' }),
        postWith({ scheduled: 1 }, { id: ids.post2, title: 'Одобрен Б' })
      ];
      const q = new URL(request.url).searchParams.get('q')?.toLocaleLowerCase('ru-RU');
      const filtered = q
        ? items.filter((item, index) =>
            (index === 0 ? 'черновик а про героя' : 'одобрен б запланирован канал').includes(q)
          )
        : items;
      return HttpResponse.json(postPage(filtered, { totalCount: filtered.length }));
    });

  it('filters the loaded rows by title, text, status label and channel while typing, and has no status filter', async () => {
    const user = userEvent.setup();
    const requests: string[] = [];
    server.use(mixed((url) => requests.push(url)));
    renderList();
    await screen.findByText('Одобрен Б');
    const table = () => screen.getByRole('grid', { name: 'Список постов' });
    expect(screen.queryByRole('button', { name: /Фильтр по статусу/ })).toBeNull();
    const field = screen.getByRole('searchbox', { name: 'Поиск по постам' });
    const loaded = requests.length;

    await user.type(field, 'ОДОБРЕН');
    await waitFor(() => expect(within(table()).queryByText('Черновик А')).toBeNull());
    expect(await within(table()).findByText('Одобрен Б')).toBeTruthy();

    await user.clear(field);
    await user.type(field, 'героя');
    await waitFor(() => expect(within(table()).queryByText('Одобрен Б')).toBeNull());
    await user.clear(field);
    await user.type(field, 'про героя');
    expect(await within(table()).findByText('Черновик А')).toBeTruthy();

    // The status label of the row: «Запланирован».
    await user.clear(field);
    await user.type(field, 'запланирован');
    await waitFor(() => expect(within(table()).queryByText('Черновик А')).toBeNull());
    expect(await within(table()).findByText('Одобрен Б')).toBeTruthy();

    await user.clear(field);
    await user.type(field, 'канал');
    await waitFor(() => expect(within(table()).queryByText('Черновик А')).toBeNull());
    expect(await within(table()).findByText('Одобрен Б')).toBeTruthy();
    expect(requests.length).toBeGreaterThan(loaded);
  });

  it('moves into the rows with Arrow Down, shows «Ничего не найдено» and restores the rows when cleared', async () => {
    const user = userEvent.setup();
    server.use(mixed());
    renderList();
    await screen.findByText('Черновик А');
    const field = screen.getByRole('searchbox', { name: 'Поиск по постам' });
    await user.click(field);
    await user.keyboard('{ArrowDown}');
    // Real focus moves into the first row, so Enter opens it and the arrows walk the rows.
    expect(document.activeElement?.getAttribute('role')).toBe('row');
    expect(document.activeElement?.textContent).toContain('Черновик А');

    await user.type(field, 'нет такого');
    expect(await screen.findByText('Ничего не найдено')).toBeTruthy();
    // The field's own clear button has the same name; the empty state's button comes last.
    await user.click(screen.getAllByRole('button', { name: 'Очистить поиск' }).at(-1) as HTMLElement);
    expect(await screen.findByText('Черновик А')).toBeTruthy();
    expect(screen.getByText('Одобрен Б')).toBeTruthy();

    await user.type(screen.getByRole('searchbox'), 'одобрен');
    await user.keyboard('{Escape}');
    expect(await screen.findByText('Черновик А')).toBeTruthy();
  });

  it('on a phone searches the cards with the same text and keeps only the sort in the sheet', async () => {
    setViewport(375);
    const user = userEvent.setup();
    const requests: string[] = [];
    server.use(mixed((url) => requests.push(url)));
    renderList();
    await screen.findByText('Черновик А');
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по постам' }), 'запланирован');
    await waitFor(() => expect(screen.queryByText('Черновик А')).toBeNull());
    expect(await screen.findByText('Одобрен Б')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Сортировка/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Сортировка' });
    expect(within(sheet).queryByRole('button', { name: /Статус/ })).toBeNull();
    await user.click(within(sheet).getByRole('button', { name: /По умолчанию/ }));
    await user.click(await screen.findByRole('option', { name: /Пост — по возрастанию/ }));
    await user.click(within(sheet).getByRole('button', { name: 'Показать результаты' }));
    expect(screen.getByRole('button', { name: /Сортировка: Пост/ })).toBeTruthy();
    await waitFor(() => expect(requests.some((url) => new URL(url).searchParams.get('sort') === 'title')).toBe(true));
  });

  it('returns keyboard focus to the sort trigger when Escape closes its sheet', async () => {
    setViewport(390);
    const user = userEvent.setup();
    server.use(mixed());
    renderList();
    await screen.findByText('Черновик А');

    const trigger = screen.getByRole('button', { name: /^Сортировка/ });
    await user.click(trigger);
    expect(await screen.findByRole('dialog', { name: 'Сортировка' })).toBeTruthy();
    await user.keyboard('{Escape}');

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

describe('duplicate post action', () => {
  const copyId = '11111111-1111-4111-8111-555555555555';
  const media = [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sourceMediaId: null,
      kind: 'photo' as const,
      fileName: 'first.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 200,
      width: 20,
      height: 10,
      durationMs: null,
      position: 0
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      sourceMediaId: null,
      kind: 'video' as const,
      fileName: 'second.mp4',
      contentType: 'video/mp4',
      sizeBytes: 400,
      width: 30,
      height: 20,
      durationMs: 1000,
      position: 1
    }
  ];

  it('copies only editorial fields, attaches media in order, then opens the server-created draft', async () => {
    const user = userEvent.setup();
    const source = postWith(
      { sent: 1 },
      {
        title: 'Повторяемый пост',
        body: 'Hello',
        entities: [{ type: 'bold', offset: 0, length: 5 }],
        media
      }
    );
    const created = post({ id: copyId, title: source.title, body: source.body, entities: source.entities });
    let createInput: unknown;
    let createKey: string | null = null;
    let attachInput: unknown;
    server.use(
      http.get('*/api/v1/posts', () => HttpResponse.json(postPage([source]))),
      http.post('*/api/v1/posts', async ({ request }) => {
        createInput = await request.json();
        createKey = request.headers.get('Idempotency-Key');
        return HttpResponse.json(created, { status: 201 });
      }),
      http.post('*/api/v1/posts/:id/media/attach', async ({ request }) => {
        attachInput = await request.json();
        return HttpResponse.json({ media, revision: 1 });
      })
    );
    const { client } = renderList();
    await screen.findByText('Повторяемый пост');
    await user.click(screen.getByRole('button', { name: 'Действия с постом «Повторяемый пост»' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Дублировать' }));

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(copyId));
    expect(createInput).toEqual({ title: source.title, body: source.body, entities: source.entities });
    expect(createKey).toBeTruthy();
    expect(attachInput).toEqual({ revision: 0, mediaIds: media.map((item) => item.id) });
    expect(client.getQueryData(['posts', 'detail', copyId])).toMatchObject({
      id: copyId,
      status: 'draft',
      media,
      publicationSummary: { counts: { sent: 0 } }
    });
  });

  it('resumes after lost create and attach responses without a second copy or attachment', async () => {
    const user = userEvent.setup();
    const source = post({ title: 'Повторяемый пост', media });
    let serverCopy = post({ id: copyId, title: source.title, body: source.body, entities: source.entities });
    const createKeys: string[] = [];
    let createCalls = 0;
    let attachCalls = 0;
    let readCalls = 0;
    server.use(
      http.get('*/api/v1/posts', () => HttpResponse.json(postPage([source]))),
      http.post('*/api/v1/posts', async ({ request }) => {
        createCalls += 1;
        createKeys.push(request.headers.get('Idempotency-Key') ?? '');
        if (createCalls === 1) {
          serverCopy = { ...serverCopy, revision: 0 };
          return HttpResponse.json(
            { error: { code: 'UNAVAILABLE', message: 'Unavailable', requestId: 'req-create' } },
            { status: 503 }
          );
        }
        return HttpResponse.json(serverCopy, { status: 201 });
      }),
      http.get(`*/api/v1/posts/${copyId}`, () => {
        readCalls += 1;
        return HttpResponse.json(serverCopy);
      }),
      http.post('*/api/v1/posts/:id/media/attach', async ({ request }) => {
        attachCalls += 1;
        const input = (await request.json()) as { revision: number; mediaIds: string[] };
        serverCopy = { ...serverCopy, media, revision: input.revision + 1 };
        return HttpResponse.json(
          { error: { code: 'UNAVAILABLE', message: 'Unavailable', requestId: 'req-attach' } },
          { status: 503 }
        );
      })
    );
    renderList();
    await screen.findByText('Повторяемый пост');
    const duplicate = async () => {
      await user.click(screen.getByRole('button', { name: 'Действия с постом «Повторяемый пост»' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Дублировать' }));
    };

    await duplicate();
    expect(await screen.findByText('Не удалось завершить копирование')).toBeTruthy();
    expect(onOpen).not.toHaveBeenCalled();
    await duplicate();
    expect(await screen.findByText('Не удалось завершить копирование')).toBeTruthy();
    expect(onOpen).not.toHaveBeenCalled();
    await duplicate();

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(copyId));
    expect(createCalls).toBe(2);
    expect(createKeys[0]).toBeTruthy();
    expect(createKeys[1]).toBe(createKeys[0]);
    expect(attachCalls).toBe(1);
    expect(readCalls).toBe(1);
  });

  it('keeps the source unchanged and shows a recoverable error when media is unavailable', async () => {
    const user = userEvent.setup();
    const source = post({ title: 'Повторяемый пост', media });
    server.use(
      http.get('*/api/v1/posts', () => HttpResponse.json(postPage([source]))),
      http.post('*/api/v1/posts', () =>
        HttpResponse.json(post({ id: copyId, title: source.title, body: source.body, entities: source.entities }), {
          status: 201
        })
      ),
      http.post('*/api/v1/posts/:id/media/attach', () =>
        HttpResponse.json(
          { error: { code: 'UNAVAILABLE', message: 'Unavailable', requestId: 'req-media' } },
          { status: 503 }
        )
      )
    );
    renderList();
    await screen.findByText('Повторяемый пост');
    await user.click(screen.getByRole('button', { name: 'Действия с постом «Повторяемый пост»' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Дублировать' }));

    expect(await screen.findByText('Не удалось завершить копирование')).toBeTruthy();
    expect(screen.getByText(/Исходный пост не изменён/)).toBeTruthy();
    expect(onOpen).not.toHaveBeenCalled();
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
