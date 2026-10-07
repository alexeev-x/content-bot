import type { PostDto } from '@alexeev/contracts';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, archivedPost, errorBody, ids, post, postPage, postWith } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { clearViewport, setViewport } from '../../../test/viewport';
import { onCreate, onOpen, renderList } from './list-harness';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
  onOpen.mockClear();
  onCreate.mockClear();
});
afterEach(() => {
  cleanup();
  clearViewport();
});

const id = (n: number) => `11111111-1111-4111-8111-00000000000${n}`;

type ListState = { live: PostDto[]; archive: PostDto[] };

/** A tiny in-memory server for GET /posts so refetches after a delete show the server's truth. */
function serve(state: ListState) {
  const gets: string[] = [];
  server.use(
    http.get('*/api/v1/posts', ({ request }) => {
      const params = new URL(request.url).searchParams;
      gets.push(params.get('view') ?? '');
      const items = params.get('view') === 'archive' ? state.archive : state.live;
      return HttpResponse.json(postPage(items, { archivedCount: state.archive.length }));
    })
  );
  return gets;
}

function conflict(reason: string, extra: Record<string, string> = {}) {
  return HttpResponse.json(errorBody('CONFLICT', { reason, ...extra }), { status: 409 });
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(await screen.findByRole('button', { name: `Действия с постом «${title}»` }));
}

describe('state of a row comes from the publication summary', () => {
  it('shows «Запланирован» with the nearest time, «Отправляется» and «Нужна сверка»', async () => {
    serve({
      live: [
        postWith({ scheduled: 1 }, { id: id(1), title: 'План' }),
        postWith({ sending: 1 }, { id: id(2), title: 'Идёт' }),
        postWith({ unknown: 1 }, { id: id(3), title: 'Сверка' }),
        post({ id: id(4), title: 'Черновик-1' })
      ],
      archive: []
    });
    renderList();
    const table = await screen.findByRole('table', { name: 'Список постов' });
    await within(table).findByText('План');
    expect(within(table).getByText('Запланирован')).toBeTruthy();
    expect(table.querySelector('time[datetime="2026-10-08T09:00:00.000Z"]')).toBeTruthy();
    expect(within(table).getByText('Отправляется')).toBeTruthy();
    expect(within(table).getByText('Нужна сверка')).toBeTruthy();
    expect(within(table).getByText('Черновик')).toBeTruthy();
  });
});

describe('archive tab', () => {
  it('shows the archive count on the tab and the archive rows with channel, sent time and days left', async () => {
    const user = userEvent.setup();
    const gets = serve({
      live: [post()],
      archive: [archivedPost({ id: id(1), title: 'Итоги' }, 20), archivedPost({ id: id(2), title: 'Скоро' }, 2)]
    });
    renderList();
    const tab = await screen.findByRole('tab', { name: /Архив/ });
    await waitFor(() => expect(tab.textContent).toContain('2'));
    await user.click(tab);
    const table = await screen.findByRole('table', { name: 'Архив постов' });
    await within(table).findByText('Итоги');
    expect(gets).toContain('archive');
    expect(screen.getByText('Опубликованные посты хранятся здесь 30 дней, затем удаляются.')).toBeTruthy();
    expect(within(table).getAllByText('Канал').length).toBe(2);
    expect(within(table).getByText('Удалится через 20 дн.')).toBeTruthy();
    // The last days carry a warning icon and the same text, so colour is not the only signal.
    expect(within(table).getByText('Удалится через 2 дн.').querySelector('svg')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Архив/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('says why the archive is empty', async () => {
    serve({ live: [post()], archive: [] });
    renderList('archive');
    expect(await screen.findByText('Архив пуст')).toBeTruthy();
    expect(screen.getByText('Здесь появятся посты после публикации. Они хранятся 30 дней.')).toBeTruthy();
  });
});

describe('deleting one post', () => {
  it('confirms by name, keeps the post on «Не удалять» and Esc, deletes with the revision and toasts', async () => {
    const user = userEvent.setup();
    const state: ListState = { live: [post({ id: id(1), title: 'Черновик А', revision: 5 })], archive: [] };
    serve(state);
    const sent: unknown[] = [];
    server.use(
      http.post('*/api/v1/posts/:id/delete', async ({ request, params }) => {
        sent.push({ id: params['id'], body: await request.json() });
        state.live = [];
        return HttpResponse.json({ id: params['id'], cancelledPublications: [] });
      })
    );
    renderList();
    await openMenu(user, 'Черновик А');
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    let dialog = await screen.findByRole('alertdialog', { name: 'Удалить пост «Черновик А»?' });
    expect(within(dialog).getByText(/Сообщения в каналах не удаляются/)).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: 'Не удалять' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await openMenu(user, 'Черновик А');
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    dialog = await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(sent).toEqual([]);
    expect(screen.getByText('Черновик А')).toBeTruthy();

    await openMenu(user, 'Черновик А');
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Удалить' }));
    expect(await screen.findByText('Пост «Черновик А» удалён')).toBeTruthy();
    expect(sent).toEqual([{ id: id(1), body: { revision: 5 } }]);
    await waitFor(() => expect(screen.queryByText('Черновик А', { selector: 'button' })).toBeNull());
  });

  it('counts the publications that will be cancelled and says channel messages stay', async () => {
    const user = userEvent.setup();
    serve({ live: [postWith({ scheduled: 2 }, { id: id(1), title: 'План' })], archive: [] });
    renderList();
    await openMenu(user, 'План');
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Удалить пост «План»?' });
    expect(within(dialog).getByText(/Будут отменены запланированные публикации: 2\./)).toBeTruthy();
    expect(within(dialog).getByText(/Первая: Канал, /)).toBeTruthy();
    expect(within(dialog).getByText(/Сообщения в каналах не удаляются\./)).toBeTruthy();
  });

  it('disables «Удалить» with a reason for sending and unknown posts, and cannot select them', async () => {
    const user = userEvent.setup();
    serve({
      live: [
        postWith({ sending: 1 }, { id: id(1), title: 'Идёт' }),
        postWith({ unknown: 1 }, { id: id(2), title: 'Сверка' })
      ],
      archive: []
    });
    renderList();
    await openMenu(user, 'Идёт');
    const blocked = await screen.findByRole('menuitem', { name: 'Удалить: идёт отправка' });
    expect(blocked.getAttribute('aria-disabled')).toBe('true');
    await user.keyboard('{Escape}');
    await openMenu(user, 'Сверка');
    expect(
      (await screen.findByRole('menuitem', { name: 'Удалить: нужна сверка результата' })).getAttribute('aria-disabled')
    ).toBe('true');
    await user.keyboard('{Escape}');
    const box = screen.getByRole('checkbox', { name: 'Пост «Идёт» нельзя выбрать: идёт отправка' });
    expect((box as HTMLInputElement).disabled).toBe(true);
  });

  it.each([
    ['PUBLICATION_IN_PROGRESS', 'Идёт отправка'],
    ['PUBLICATION_UNKNOWN', 'Нужна сверка результата']
  ])(
    'when the server answers 409 %s the dialog closes, data is refetched and a banner links the publication',
    async (reason, title) => {
      const user = userEvent.setup();
      const gets = serve({ live: [post({ id: id(1), title: 'Черновик А' })], archive: [] });
      server.use(http.post('*/api/v1/posts/:id/delete', () => conflict(reason, { publicationId: ids.publication })));
      renderList();
      await openMenu(user, 'Черновик А');
      await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
      const before = gets.length;
      await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Удалить' }));
      const banner = (await screen.findByText(title)).closest<HTMLElement>('[data-tone="warning"]')!;
      expect(within(banner).getByRole('link', { name: 'Открыть публикацию' }).getAttribute('href')).toContain(
        ids.publication
      );
      expect(screen.queryByRole('alertdialog')).toBeNull();
      await waitFor(() => expect(gets.length).toBeGreaterThan(before));
      expect(screen.getByText('Черновик А')).toBeTruthy();
    }
  );

  it('answers a stale revision with the banner «Состояние поста изменилось» and fresh data', async () => {
    const user = userEvent.setup();
    const gets = serve({ live: [post({ id: id(1), title: 'Черновик А' })], archive: [] });
    server.use(http.post('*/api/v1/posts/:id/delete', () => conflict('STALE_REVISION')));
    renderList();
    await openMenu(user, 'Черновик А');
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    const before = gets.length;
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Удалить' }));
    const banner = await screen.findByRole('alert');
    expect(within(banner).getByText('Состояние поста изменилось')).toBeTruthy();
    expect(within(banner).getByText(/Обновили данные\./)).toBeTruthy();
    await waitFor(() => expect(gets.length).toBeGreaterThan(before));
  });

  it('on a 5xx keeps the dialog and the post, shows the request id, and retry deletes', async () => {
    const user = userEvent.setup();
    const state: ListState = { live: [post({ id: id(1), title: 'Черновик А' })], archive: [] };
    serve(state);
    let call = 0;
    server.use(
      http.post('*/api/v1/posts/:id/delete', ({ params }) => {
        call += 1;
        if (call === 1) return HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 });
        state.live = [];
        return HttpResponse.json({ id: params['id'], cancelledPublications: [] });
      })
    );
    renderList();
    await openMenu(user, 'Черновик А');
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    expect(await within(dialog).findByText(/Ничего не удалено/)).toBeTruthy();
    expect(within(dialog).getByText(/req-test-1/)).toBeTruthy();
    expect(screen.queryByText('Пост «Черновик А» удалён')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Пост «Черновик А» удалён')).toBeTruthy();
  });
});

describe('bulk selection in the archive', () => {
  const three = () => [
    archivedPost({ id: id(1), title: 'Один' }),
    archivedPost({ id: id(2), title: 'Два' }),
    archivedPost({ id: id(3), title: 'Три' })
  ];

  async function select(user: ReturnType<typeof userEvent.setup>, ...titles: string[]) {
    for (const title of titles)
      await user.click(await screen.findByRole('checkbox', { name: `Выбрать пост «${title}»` }));
  }

  it('deletes 3 selected posts after confirming «Удалить 3 поста» and toasts «Удалено: 3»', async () => {
    const user = userEvent.setup();
    const state: ListState = { live: [], archive: three() };
    serve(state);
    let body: { items: Array<{ id: string; revision: number }> } | undefined;
    server.use(
      http.post('*/api/v1/posts/delete', async ({ request }) => {
        body = (await request.json()) as typeof body;
        state.archive = [];
        return HttpResponse.json({
          items: body!.items.map((item) => ({ id: item.id, outcome: 'deleted', cancelledPublications: [] }))
        });
      })
    );
    renderList('archive');
    await select(user, 'Один', 'Два', 'Три');
    const bar = screen.getByRole('toolbar', { name: 'Выбранные посты' });
    expect(within(bar).getByText('Выбрано: 3')).toBeTruthy();
    await user.click(within(bar).getByRole('button', { name: 'Удалить' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Удалить 3 поста?' });
    expect(within(dialog).getByText(/Сообщения в каналах не удаляются\. Восстановить нельзя\./)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Удалить 3 поста' }));
    expect(await screen.findByText('Удалено: 3')).toBeTruthy();
    expect(body?.items).toHaveLength(3);
    expect(body?.items[0]).toEqual({ id: id(1), revision: 2 });
    await waitFor(() => expect(screen.queryByRole('toolbar', { name: 'Выбранные посты' })).toBeNull());
    expect(await screen.findByText('Архив пуст')).toBeTruthy();
  });

  it('reports a partial result and keeps the refused row selected with its reason', async () => {
    const user = userEvent.setup();
    const state: ListState = { live: [], archive: three() };
    serve(state);
    server.use(
      http.post('*/api/v1/posts/delete', () => {
        state.archive = state.archive.filter((item) => item.id === id(2));
        return HttpResponse.json({
          items: [
            { id: id(1), outcome: 'deleted', cancelledPublications: [] },
            { id: id(2), outcome: 'refused', reason: 'PUBLICATION_IN_PROGRESS', publicationId: ids.publication },
            { id: id(3), outcome: 'deleted', cancelledPublications: [] }
          ]
        });
      })
    );
    renderList('archive');
    await select(user, 'Один', 'Два', 'Три');
    await user.click(within(screen.getByRole('toolbar')).getByRole('button', { name: 'Удалить' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Удалить 3 поста' }));
    expect(await screen.findByText('Удалено: 2 из 3. Не удалось: 1')).toBeTruthy();
    expect(await screen.findByText('Не удалось: идёт отправка')).toBeTruthy();
    const kept = await screen.findByRole('checkbox', { name: 'Выбрать пост «Два»' });
    expect((kept as HTMLInputElement).checked).toBe(true);
    expect(within(screen.getByRole('toolbar')).getByText('Выбрано: 1')).toBeTruthy();
  });

  it('restores selected posts without a confirmation and says what the server did', async () => {
    const user = userEvent.setup();
    const state: ListState = { live: [], archive: three() };
    serve(state);
    server.use(
      http.post('*/api/v1/posts/restore', () => {
        state.archive = [state.archive[2]!];
        return HttpResponse.json({
          items: [
            { id: id(1), outcome: 'restored' },
            { id: id(2), outcome: 'restored' },
            { id: id(3), outcome: 'refused', reason: 'STALE_REVISION' }
          ]
        });
      })
    );
    renderList('archive');
    await select(user, 'Один', 'Два', 'Три');
    await user.click(within(screen.getByRole('toolbar')).getByRole('button', { name: 'Вернуть из архива' }));
    expect(await screen.findByText('Возвращено: 2 из 3. Не удалось: 1')).toBeTruthy();
    expect(screen.queryByRole('alertdialog', { name: /Удалить/ })).toBeNull();
  });

  it('restores one post from its menu and toasts «Пост возвращён из архива»', async () => {
    const user = userEvent.setup();
    const state: ListState = { live: [], archive: [archivedPost({ id: id(1), title: 'Один', revision: 4 })] };
    serve(state);
    let sent: unknown;
    server.use(
      http.post('*/api/v1/posts/:id/restore', async ({ request }) => {
        sent = await request.json();
        state.archive = [];
        return HttpResponse.json(post({ id: id(1), status: 'approved', revision: 4 }));
      })
    );
    renderList('archive');
    await openMenu(user, 'Один');
    await user.click(await screen.findByRole('menuitem', { name: 'Вернуть из архива' }));
    expect(await screen.findByText('Пост возвращён из архива')).toBeTruthy();
    expect(sent).toEqual({ revision: 4 });
  });

  it('selects a range with Shift+click, selects all loaded rows with the header box, and Esc clears', async () => {
    const user = userEvent.setup();
    serve({ live: [], archive: three() });
    renderList('archive');
    await select(user, 'Один');
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('checkbox', { name: 'Выбрать пост «Три»' }));
    await user.keyboard('{/Shift}');
    expect(within(screen.getByRole('toolbar')).getByText('Выбрано: 3')).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
    await user.click(screen.getByRole('checkbox', { name: 'Выбрать все загруженные посты' }));
    expect(within(screen.getByRole('toolbar')).getByText('Выбрано: 3')).toBeTruthy();
    await user.click(within(screen.getByRole('toolbar')).getByRole('button', { name: 'Снять выделение' }));
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('drops the selection when the tab changes', async () => {
    const user = userEvent.setup();
    serve({ live: [post({ id: id(9), title: 'Живой' })], archive: three() });
    renderList('archive');
    await select(user, 'Один');
    await user.click(screen.getByRole('tab', { name: 'Все' }));
    await screen.findByText('Живой');
    expect(screen.queryByRole('toolbar')).toBeNull();
  });
});

describe('phone', () => {
  it('shows checkboxes only after «Выбрать», with 44 px-class controls reachable by the same labels', async () => {
    setViewport(375);
    const user = userEvent.setup();
    serve({ live: [post({ id: id(1), title: 'Черновик А' })], archive: [] });
    renderList();
    await screen.findByRole('button', { name: 'Черновик А' });
    expect(screen.queryByRole('checkbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Выбрать' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Выбрать пост «Черновик А»' }));
    const bar = screen.getByRole('toolbar', { name: 'Выбранные посты' });
    expect(within(bar).getByText('Выбрано: 1')).toBeTruthy();
    expect(within(bar).getByRole('button', { name: 'Удалить' })).toBeTruthy();
    await user.click(within(bar).getByRole('button', { name: 'Снять выделение' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    await openMenu(user, 'Черновик А');
    expect(await screen.findByRole('menuitem', { name: 'Удалить' })).toBeTruthy();
  });
});
