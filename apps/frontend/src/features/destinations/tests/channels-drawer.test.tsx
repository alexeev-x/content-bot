import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, destination, errorBody, ids } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { checkDto, checkOutcomes } from './check-fixtures';
import { renderChannels } from './render-channels';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(cleanup);

async function openDrawer() {
  const rendered = renderChannels(ids.destination);
  const drawer = await screen.findByRole('dialog', { name: 'Канал' });
  return { ...rendered, drawer };
}

const patches = () => {
  const bodies: Array<Record<string, unknown>> = [];
  return {
    bodies,
    handler: (respond: (body: Record<string, unknown>) => Response) =>
      http.patch('*/api/v1/destinations/:id', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        bodies.push(body);
        return respond(body);
      })
  };
};

describe('channel drawer', () => {
  it('renames the channel with the current revision and confirms only after the server answers', async () => {
    const { bodies, handler } = patches();
    server.use(handler(() => HttpResponse.json(destination({ title: 'Новое имя', revision: 1 }))));
    const { user, drawer } = await openDrawer();
    const title = within(drawer).getByRole('textbox', { name: 'Название' });
    await user.clear(title);
    await user.type(title, 'Новое имя');
    await user.click(within(drawer).getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Изменения сохранены')).toBeTruthy();
    expect(bodies).toEqual([{ revision: 0, title: 'Новое имя' }]);
  });

  it('keeps typed edits on 409 STALE_REVISION, shows the server version, and saves again on the new revision', async () => {
    const { bodies, handler } = patches();
    let served = destination({ title: 'Канал', revision: 0 });
    server.use(
      http.get('*/api/v1/destinations/:id', () => HttpResponse.json(served)),
      handler((body) => {
        if (body['revision'] === 0) {
          served = destination({ title: 'Чужое имя', revision: 1 });
          return HttpResponse.json(errorBody('CONFLICT', { reason: 'STALE_REVISION' }), { status: 409 });
        }
        return HttpResponse.json(destination({ title: String(body['title']), revision: 2 }));
      })
    );
    const { user, drawer } = await openDrawer();
    const title = within(drawer).getByRole('textbox', { name: 'Название' }) as HTMLInputElement;
    await user.clear(title);
    await user.type(title, 'Моё имя');
    await user.click(within(drawer).getByRole('button', { name: 'Сохранить' }));

    expect(await within(drawer).findByText('Канал изменили в другом месте')).toBeTruthy();
    expect(await within(drawer).findByText(/«Чужое имя»/)).toBeTruthy();
    expect(title.value).toBe('Моё имя');

    await user.click(within(drawer).getByRole('button', { name: 'Оставить мои правки' }));
    await user.click(within(drawer).getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Изменения сохранены')).toBeTruthy();
    expect(bodies.at(-1)).toEqual({ revision: 1, title: 'Моё имя' });
  });

  it('can take the server version after a conflict', async () => {
    let served = destination({ revision: 0 });
    server.use(
      http.get('*/api/v1/destinations/:id', () => HttpResponse.json(served)),
      http.patch('*/api/v1/destinations/:id', () => {
        served = destination({ title: 'Чужое имя', revision: 1 });
        return HttpResponse.json(errorBody('CONFLICT', { reason: 'STALE_REVISION' }), { status: 409 });
      })
    );
    const { user, drawer } = await openDrawer();
    const title = within(drawer).getByRole('textbox', { name: 'Название' }) as HTMLInputElement;
    await user.type(title, ' мой');
    await user.click(within(drawer).getByRole('button', { name: 'Сохранить' }));
    await within(drawer).findByText(/«Чужое имя»/);
    await user.click(within(drawer).getByRole('button', { name: 'Взять версию с сервера' }));
    expect(title.value).toBe('Чужое имя');
  });

  it('asks before disabling, explains scheduled posts, and sends nothing on «Оставить включённым»', async () => {
    const { bodies, handler } = patches();
    server.use(handler(() => HttpResponse.json(destination({ enabled: false, revision: 1 }))));
    const { user, drawer } = await openDrawer();
    const toggle = within(drawer).getByRole('switch', { name: 'Канал включён' });

    await user.click(toggle);
    expect(await within(drawer).findByText(/Ожидающих публикаций: 2/)).toBeTruthy();
    expect(within(drawer).getByText(/ошибкой/)).toBeTruthy();
    expect(bodies).toHaveLength(0);
    expect((toggle as HTMLInputElement).checked).toBe(true);

    await user.click(within(drawer).getByRole('button', { name: 'Оставить включённым' }));
    expect(within(drawer).queryByText(/завершатся ошибкой/)).toBeNull();
    expect(bodies).toHaveLength(0);

    await user.click(toggle);
    await user.click(within(drawer).getByRole('button', { name: 'Отключить канал' }));
    expect(await screen.findByText('Канал отключён')).toBeTruthy();
    expect(bodies).toEqual([{ revision: 0, enabled: false }]);
    await waitFor(() => expect((within(drawer).getByRole('switch') as HTMLInputElement).checked).toBe(false));
  });

  it('enables a disabled channel without a confirmation', async () => {
    const { bodies, handler } = patches();
    server.use(
      http.get('*/api/v1/destinations/:id', () => HttpResponse.json(destination({ enabled: false }))),
      handler(() => HttpResponse.json(destination({ enabled: true, revision: 1 })))
    );
    const { user, drawer } = await openDrawer();
    await user.click(within(drawer).getByRole('switch', { name: 'Канал включён' }));
    expect(await screen.findByText('Канал включён', { selector: '[class*="title"]' })).toBeTruthy();
    expect(bodies).toEqual([{ revision: 0, enabled: true }]);
  });

  it('checks the bot rights of the current chat', async () => {
    server.use(checkOutcomes.notAdmin());
    const { user, drawer } = await openDrawer();
    await user.click(within(drawer).getByRole('button', { name: 'Проверить права бота' }));
    expect(await within(drawer).findByText('Бот не администратор канала')).toBeTruthy();
  });

  it('requires a successful check before a new chat id can be applied', async () => {
    const { bodies, handler } = patches();
    server.use(handler(() => HttpResponse.json(destination({ chatId: '-1009876543210', revision: 1 }))));
    const { user, drawer } = await openDrawer();
    await user.click(within(drawer).getByRole('button', { name: 'Изменить ID чата' }));

    const apply = within(drawer).getByRole('button', { name: 'Применить новый ID' });
    expect(apply.hasAttribute('disabled')).toBe(true);

    server.use(http.post('*/api/v1/destinations/check', () => HttpResponse.json(checkDto())));
    await user.type(within(drawer).getByRole('textbox', { name: /Новый @username или ID/ }), '-1009876543210');
    await user.click(within(drawer).getByRole('button', { name: 'Проверить' }));
    await within(drawer).findByText('Бот может публиковать');
    expect(apply.hasAttribute('disabled')).toBe(false);

    await user.click(apply);
    expect(await screen.findByText('ID чата обновлён')).toBeTruthy();
    expect(bodies).toEqual([{ revision: 0, chatId: '-1009876543210' }]);
  });

  it('refuses to apply a chat the bot cannot post to', async () => {
    server.use(checkOutcomes.cannotPost());
    const { user, drawer } = await openDrawer();
    await user.click(within(drawer).getByRole('button', { name: 'Изменить ID чата' }));
    await user.type(within(drawer).getByRole('textbox', { name: /Новый @username или ID/ }), '@other_chat');
    await user.click(within(drawer).getByRole('button', { name: 'Проверить' }));
    await within(drawer).findByText('У бота нет права публиковать');
    expect(within(drawer).getByRole('button', { name: 'Применить новый ID' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows a not-found state for a stale deep link', async () => {
    server.use(
      http.get('*/api/v1/destinations/:id', () =>
        HttpResponse.json(errorBody('NOT_FOUND', { reason: 'DESTINATION_NOT_FOUND' }), { status: 404 })
      )
    );
    renderChannels(ids.destination);
    expect(await screen.findByText('Канал не найден')).toBeTruthy();
  });
});
