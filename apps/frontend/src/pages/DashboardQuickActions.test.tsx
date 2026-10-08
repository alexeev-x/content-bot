import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dashboard } from '../test/dashboard-fixtures';
import { clearSession, setSession } from '../shared/api/session';
import { accessToken, destination, errorBody, post, postPage } from '../test/fixtures';
import { server, setupMswServer } from '../test/msw';
import { renderPage } from '../test/render-app';
import { clearViewport, setViewport } from '../test/viewport';
import { DashboardPage } from './DashboardPage';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
  setViewport(1280);
  server.use(
    http.get('*/api/v1/dashboard', () => HttpResponse.json(dashboard())),
    http.get('*/api/v1/health', () =>
      HttpResponse.json({
        status: 'ok',
        service: 'content-bot',
        publishingEnabled: false,
        time: '2026-10-07T10:05:00.000Z'
      })
    )
  );
});
afterEach(() => {
  cleanup();
  clearViewport();
});

async function renderDashboard() {
  const user = userEvent.setup();
  const view = await renderPage(<DashboardPage />);
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
  const quick = await screen.findByRole('region', { name: 'Быстрые действия' });
  return { user, quick, ...view };
}

describe('quick actions work in place', () => {
  it('«Новый пост» saves one draft through the create request, closes, toasts and keeps the route', async () => {
    const created: unknown[] = [];
    server.use(
      http.post('*/api/v1/posts', async ({ request }) => {
        created.push(await request.json());
        return HttpResponse.json(post({ title: 'Быстрый' }), { status: 201 });
      })
    );
    const { user, quick, router } = await renderDashboard();
    await user.click(within(quick).getByRole('button', { name: 'Новый пост' }));
    const dialog = await screen.findByRole('dialog', { name: 'Новый пост' });
    expect(router.state.location.pathname).toBe('/');
    await user.type(within(dialog).getByRole('textbox', { name: /Заголовок/ }), 'Быстрый');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить черновик' }));
    expect(await screen.findByText('Черновик сохранён')).toBeTruthy();
    expect(created).toHaveLength(1);
    expect(screen.queryByRole('dialog', { name: 'Новый пост' })).toBeNull();
    expect(router.state.location.pathname).toBe('/');
    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/posts\//));
  });

  it('«Открыть в редакторе» navigates only after the server confirmed the draft', async () => {
    const { user, quick, router } = await renderDashboard();
    await user.click(within(quick).getByRole('button', { name: 'Новый пост' }));
    const dialog = await screen.findByRole('dialog', { name: 'Новый пост' });
    await user.type(within(dialog).getByRole('textbox', { name: /Заголовок/ }), 'Быстрый');
    await user.click(within(dialog).getByRole('button', { name: 'Открыть в редакторе' }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/posts\//));
  });

  it('a server error stays inside the dialog and keeps the typed text', async () => {
    server.use(http.post('*/api/v1/posts', () => HttpResponse.json(errorBody('UNAVAILABLE'), { status: 500 })));
    const { user, quick, router } = await renderDashboard();
    await user.click(within(quick).getByRole('button', { name: 'Новый пост' }));
    const dialog = await screen.findByRole('dialog', { name: 'Новый пост' });
    const title = within(dialog).getByRole('textbox', { name: /Заголовок/ }) as HTMLInputElement;
    await user.type(title, 'Не потерять');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить черновик' }));
    await waitFor(() => expect(within(dialog).getAllByRole('alert').length).toBeGreaterThan(0));
    expect(title.value).toBe('Не потерять');
    expect(screen.getByRole('dialog', { name: 'Новый пост' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/');
  });

  it('cancelling a dirty form asks first; a clean one closes at once', async () => {
    const { user, quick } = await renderDashboard();
    await user.click(within(quick).getByRole('button', { name: 'Новый пост' }));
    let dialog = await screen.findByRole('dialog', { name: 'Новый пост' });
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Новый пост' })).toBeNull());

    await user.click(within(quick).getByRole('button', { name: 'Новый пост' }));
    dialog = await screen.findByRole('dialog', { name: 'Новый пост' });
    await user.type(within(dialog).getByRole('textbox', { name: /Заголовок/ }), 'Что-то');
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Выйти без сохранения?' });
    await user.click(within(ask).getByRole('button', { name: 'Остаться' }));
    expect(screen.getByRole('dialog', { name: 'Новый пост' })).toBeTruthy();
    await user.click(
      within(screen.getByRole('dialog', { name: 'Новый пост' })).getByRole('button', { name: 'Отмена' })
    );
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Выйти без сохранения' })
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Новый пост' })).toBeNull());
  });

  it('«Опубликовать пост» opens the picker, then the publish dialog, without leaving the page', async () => {
    server.use(
      http.get('*/api/v1/posts', ({ request }) =>
        HttpResponse.json(
          postPage(new URL(request.url).searchParams.get('status') === 'approved' ? [post({ status: 'approved' })] : [])
        )
      ),
      http.get('*/api/v1/destinations', () => HttpResponse.json({ items: [destination()], nextCursor: null }))
    );
    const { user, quick, router } = await renderDashboard();
    await user.click(within(quick).getByRole('button', { name: 'Опубликовать пост' }));
    const picker = await screen.findByRole('dialog', { name: 'Какой пост опубликовать?' });
    await user.click(await within(picker).findByRole('button', { name: /Пост/ }));
    await user.click(await screen.findByRole('option', { name: 'Заголовок' }));
    await user.click(within(picker).getByRole('button', { name: 'Дальше' }));
    expect(await screen.findByRole('dialog', { name: 'Опубликовать пост' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/');
  });

  it('«Добавить канал» opens the add-channel dialog in place', async () => {
    const { user, quick, router } = await renderDashboard();
    await user.click(within(quick).getByRole('button', { name: 'Добавить канал' }));
    expect(await screen.findByRole('dialog', { name: 'Добавить канал' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/');
  });
});
