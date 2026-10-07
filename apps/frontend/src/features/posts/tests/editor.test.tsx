import { POST_BODY_MAX } from '@alexeev/contracts';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, errorBody, ids, post } from '../../../test/fixtures';
import { failWith, server, setupMswServer } from '../../../test/msw';
import { renderEditorApp } from './harness';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(cleanup);

const titleBox = () => screen.getByRole('textbox', { name: /Заголовок/ });
const bodyBox = () => screen.getByRole('textbox', { name: 'Текст' });

async function openExisting(overrides = {}) {
  server.use(http.get('*/api/v1/posts/:id', () => HttpResponse.json(post(overrides))));
  const app = renderEditorApp(`/posts/${ids.post}`);
  await screen.findByRole('textbox', { name: 'Текст' });
  return app;
}

describe('create', () => {
  it('creates the draft on first save with an Idempotency-Key and replaces the route with /posts/:id', async () => {
    const user = userEvent.setup();
    const seen: Array<{ key: string | null; body: unknown }> = [];
    server.use(
      http.post('*/api/v1/posts', async ({ request }) => {
        seen.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
        return HttpResponse.json(post({ title: 'Новый', body: 'Текст' }), { status: 201 });
      })
    );
    const { router } = renderEditorApp('/posts/new');
    await user.type(await screen.findByRole('textbox', { name: /Заголовок/ }), 'Новый');
    await user.type(bodyBox(), 'Текст');
    await user.click(screen.getByRole('button', { name: 'Создать черновик' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/posts/${ids.post}`));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.key).toBeTruthy();
    expect(seen[0]?.body).toEqual({ title: 'Новый', body: 'Текст' });
    // The leave guard did not interrupt the navigation that follows a successful create.
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await screen.findByText(/Сохранено в/)).toBeTruthy();
  });

  it('shows validation and sends nothing when the title is empty', async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.post('*/api/v1/posts', () => {
        calls += 1;
        return HttpResponse.json(post(), { status: 201 });
      })
    );
    renderEditorApp('/posts/new');
    await user.type(await screen.findByRole('textbox', { name: 'Текст' }), 'Только текст');
    await user.click(screen.getByRole('button', { name: 'Создать черновик' }));
    expect(await screen.findByText('Введите заголовок')).toBeTruthy();
    expect(titleBox().getAttribute('aria-invalid')).toBe('true');
    expect(calls).toBe(0);
    expect((bodyBox() as HTMLTextAreaElement).value).toBe('Только текст');
  });
});

describe('save', () => {
  it('saves only the changed field with the baseline revision on Ctrl+S, and keeps focus-free status text', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    server.use(
      http.patch('*/api/v1/posts/:id', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(post({ revision: 1, body: 'Правка' }));
      })
    );
    await openExisting();
    await user.clear(bodyBox());
    await user.type(bodyBox(), 'Правка');
    expect(screen.getByText('Есть несохранённые изменения')).toBeTruthy();
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(bodies).toEqual([{ revision: 0, body: 'Правка' }]));
    expect(await screen.findByText(/Сохранено в/)).toBeTruthy();
    expect(screen.getByText('Ревизия 1')).toBeTruthy();
  });

  it('shows a persistent error with the requestId and keeps the text when the server is down', async () => {
    const user = userEvent.setup();
    await openExisting();
    server.use(failWith('patch', `/api/v1/posts/${ids.post}`, { status: 503, code: 'UNAVAILABLE' }));
    await user.type(bodyBox(), ' дополнение');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('req-test-1');
    expect(alert.textContent).toContain('Ваш текст остался в редакторе');
    expect((bodyBox() as HTMLTextAreaElement).value).toBe('Текст поста дополнение');
    expect(screen.getByText('Не сохранено')).toBeTruthy();
  });
});

describe('409 STALE_REVISION', () => {
  it('keeps the local text, compares versions and overwrites only after an explicit confirmation', async () => {
    const user = userEvent.setup();
    const patches: unknown[] = [];
    await openExisting();
    server.use(
      http.get('*/api/v1/posts/:id', () =>
        HttpResponse.json(post({ revision: 3, title: 'Чужой заголовок', body: 'Чужой текст' }))
      ),
      http.patch('*/api/v1/posts/:id', async ({ request }) => {
        const body = (await request.json()) as { revision: number };
        patches.push(body);
        return body.revision === 0
          ? HttpResponse.json(errorBody('CONFLICT', { reason: 'STALE_REVISION' }), { status: 409 })
          : HttpResponse.json(post({ revision: 4, body: 'Мой текст' }));
      })
    );
    await user.clear(bodyBox());
    await user.type(bodyBox(), 'Мой текст');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    const banner = await screen.findByText('Пост уже изменён в другом месте');
    expect(banner).toBeTruthy();
    expect((bodyBox() as HTMLTextAreaElement).value).toBe('Мой текст');

    await user.click(await screen.findByRole('button', { name: 'Показать серверную версию' }));
    const dialog = await screen.findByRole('dialog', { name: 'Сравнение версий' });
    expect(within(dialog).getByText('Чужой текст')).toBeTruthy();
    expect(within(dialog).getByText('Мой текст')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'К редактору' }));
    expect(patches).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Перезаписать моими' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(patches).toHaveLength(1);
    await user.click(within(confirm).getByRole('button', { name: 'Перезаписать' }));

    await waitFor(() =>
      expect(patches).toEqual([
        { revision: 0, body: 'Мой текст' },
        { revision: 3, title: 'Заголовок', body: 'Мой текст' }
      ])
    );
    await waitFor(() => expect(screen.queryByText('Пост уже изменён в другом месте')).toBeNull());
    expect(screen.getByText('Ревизия 4')).toBeTruthy();
  });
});

describe('approve', () => {
  it('confirms, approves with the saved revision, hides the editor, and shows the publish action', async () => {
    const user = userEvent.setup();
    const approvals: unknown[] = [];
    server.use(
      http.post('*/api/v1/posts/:id/approve', async ({ request }) => {
        approvals.push(await request.json());
        return HttpResponse.json(post({ revision: 1, status: 'approved' }));
      })
    );
    server.use(http.get('*/api/v1/posts/:id', () => HttpResponse.json(post())));
    renderEditorApp(`/posts/${ids.post}`);
    await screen.findByRole('textbox', { name: 'Текст' });
    await user.click(screen.getByRole('button', { name: 'Одобрить' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(approvals).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Одобрить пост' }));
    await waitFor(() => expect(approvals).toEqual([{ revision: 0 }]));
    expect(await screen.findByText('Пост одобрен и закрыт для правок')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Заголовок' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Текст' })).toBeNull();
    expect(screen.getByRole('figure', { name: 'Предпросмотр в Telegram' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Сохранить' })).toBeNull();
  });

  it('shows EMPTY_BODY under the body field and keeps the post a draft', async () => {
    const user = userEvent.setup();
    server.use(
      failWith('post', `/api/v1/posts/${ids.post}/approve`, {
        status: 400,
        code: 'VALIDATION_ERROR',
        reason: 'EMPTY_BODY'
      })
    );
    await openExisting({ body: '' });
    await user.click(screen.getByRole('button', { name: 'Одобрить' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Одобрить пост' }));
    expect(await screen.findByText('Добавьте текст поста: без него одобрить нельзя')).toBeTruthy();
    expect(bodyBox().getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByText('Пост одобрен и закрыт для правок')).toBeNull();
  });

  it('opens an already approved post read-only with the explanation and the publish slot', async () => {
    server.use(http.get('*/api/v1/posts/:id', () => HttpResponse.json(post({ status: 'approved', revision: 2 }))));
    renderEditorApp(`/posts/${ids.post}`, () => <button type="button">Опубликовать</button>);
    expect(await screen.findByText('Пост одобрен и закрыт для правок')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /Заголовок/ })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Текст' })).toBeNull();
    expect(screen.getByRole('figure', { name: 'Предпросмотр в Telegram' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Опубликовать' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Одобрить' })).toBeNull();
  });

  it('turns NOT_EDITABLE on save into a read-only state that keeps the typed text', async () => {
    const user = userEvent.setup();
    await openExisting();
    server.use(
      failWith('patch', `/api/v1/posts/${ids.post}`, { status: 409, code: 'CONFLICT', reason: 'NOT_EDITABLE' }),
      http.get('*/api/v1/posts/:id', () => HttpResponse.json(post({ status: 'approved', revision: 1 })))
    );
    await user.type(bodyBox(), '!');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Пост уже одобрен в другом месте')).toBeTruthy();
    expect((bodyBox() as HTMLTextAreaElement).value).toBe('Текст поста!');
    expect(bodyBox().hasAttribute('readonly')).toBe(true);
  });
});

describe('leave guard', () => {
  it('asks before leaving with unsaved text; staying keeps the text, leaving navigates', async () => {
    const user = userEvent.setup();
    const { router } = await openExisting();
    await user.type(bodyBox(), '!');
    await user.click(screen.getByRole('link', { name: 'Уйти' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Выйти без сохранения?' });
    await user.click(within(dialog).getByRole('button', { name: 'Остаться' }));
    expect(router.state.location.pathname).toBe(`/posts/${ids.post}`);
    expect((bodyBox() as HTMLTextAreaElement).value).toBe('Текст поста!');

    await user.click(screen.getByRole('link', { name: 'Уйти' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Выйти без сохранения' })
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/calendar'));
  });

  it('does not interfere when nothing changed and warns on tab close only while dirty', async () => {
    const user = userEvent.setup();
    server.use(http.get('*/api/v1/posts/:id', () => HttpResponse.json(post())));
    renderEditorApp(`/posts/${ids.post}`, undefined, { browserHistory: true });
    await screen.findByRole('textbox', { name: 'Текст' });
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    await user.type(bodyBox(), '!');
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});

describe('limits and preview', () => {
  it('counts the body against 4096 and the whole message with title and blank line', async () => {
    const user = userEvent.setup();
    await openExisting({ title: 'Тест', body: '' });
    await user.click(bodyBox());
    await user.paste('a'.repeat(100));
    expect(screen.getAllByText('100 / 4096').length).toBeGreaterThan(0);
    // 4 (title) + 2 (blank line) + 100 (body)
    expect(screen.getAllByText('В сообщении 106 из 4096 символов').length).toBeGreaterThan(0);
  });

  it('warns when title and body together exceed Telegram, keeps saving possible, and blocks approval', async () => {
    const user = userEvent.setup();
    await openExisting({ title: 'Заголовок', body: '' });
    await user.click(bodyBox());
    await user.paste('b'.repeat(POST_BODY_MAX - 5));
    expect(await screen.findByText(/Сообщение длиннее лимита Telegram на 6/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Сохранить' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Одобрить' }).hasAttribute('disabled')).toBe(true);
  });

  it('previews the title and body as plain text, so markup is shown literally', async () => {
    const user = userEvent.setup();
    await openExisting({ title: 'Заголовок', body: '' });
    await user.click(bodyBox());
    await user.paste('<b>жирный</b> & текст');
    const preview = screen.getByRole('figure', { name: 'Предпросмотр в Telegram' });
    expect(within(preview).getByText('Заголовок').tagName).toBe('STRONG');
    expect(within(preview).getByText('<b>жирный</b> & текст')).toBeTruthy();
    expect(preview.querySelector('b')).toBeNull();
  });
});
