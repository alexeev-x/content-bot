import { POST_BODY_MAX } from '@alexeev/contracts';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, errorBody, ids, post } from '../../../test/fixtures';
import { failWith, server, setupMswServer } from '../../../test/msw';
import { renderEditorApp } from './harness';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const titleBox = () => screen.getByRole('textbox', { name: /Заголовок/ });
const bodyBox = () => screen.getByRole('textbox', { name: 'Текст' });

/** user-event puts the caret at the start of a contenteditable (it keeps the end of a textarea): move it by hand. */
async function typeAtEnd(user: ReturnType<typeof userEvent.setup>, text: string) {
  const box = bodyBox();
  box.focus();
  const selection = window.getSelection();
  selection?.selectAllChildren(box);
  selection?.collapseToEnd();
  await user.keyboard(text);
}

// Ctrl+A goes through ProseMirror's own keymap; a DOM selection (user.clear) reaches the editor state only on a
// later selectionchange, so under load the typed text landed before the old one.
async function replaceBody(user: ReturnType<typeof userEvent.setup>, text: string) {
  const box = bodyBox();
  box.focus();
  await user.keyboard('{Control>}a{/Control}');
  await user.paste(text);
  await waitFor(() => expect(box.textContent).toBe(text));
}

async function openExisting(overrides = {}) {
  server.use(http.get('*/api/v1/posts/:id', () => HttpResponse.json(post(overrides))));
  const app = renderEditorApp(`/posts/${ids.post}`);
  await screen.findByRole('textbox', { name: 'Текст' });
  return app;
}

function useNarrowViewport() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(max-width: 859px)',
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
}

describe('mobile editor navigation', () => {
  it('keeps text, media and preview in one mobile flow and preserves editor content', async () => {
    useNarrowViewport();
    const user = userEvent.setup();
    await openExisting({ body: 'Сохранённый текст' });

    expect(screen.getByRole('textbox', { name: 'Заголовок' })).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    const mediaHeading = screen.getByRole('heading', { name: 'Фото и видео' });
    expect(screen.getAllByRole('heading', { name: 'Фото и видео' })).toHaveLength(1);
    expect(screen.queryByRole('figure', { name: /Предпросмотр в Telegram/ })).toBeNull();
    const mediaSection = mediaHeading.closest('section');
    const mediaEditor = mediaSection?.parentElement;
    expect(mediaEditor).toBeTruthy();
    if (!mediaEditor) throw new Error('Media editor section is missing');
    expect(mediaEditor.hasAttribute('hidden')).toBe(false);
    expect(screen.getByRole('heading', { name: 'Фото и видео' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { name: 'Фото и видео' })).toHaveLength(1);
    await user.click(bodyBox());
    await user.keyboard('!');
    expect(bodyBox().textContent).toContain('Сохранённый текст');
    expect(bodyBox().textContent).toContain('!');
  });

  it('keeps typed text and stays in the editor when back navigation cannot save', async () => {
    useNarrowViewport();
    const user = userEvent.setup();
    const { router } = await openExisting();
    server.use(failWith('patch', `/api/v1/posts/${ids.post}`, { status: 503, code: 'UNAVAILABLE' }));

    await typeAtEnd(user, ' важная правка');
    await user.click(screen.getByRole('button', { name: 'Все посты' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(router.state.location.pathname).toBe(`/posts/${ids.post}`);
    expect(bodyBox().textContent).toContain('важная правка');
  });
});

describe('create', () => {
  it('does not create a draft when the blank editor is only visited', async () => {
    let creates = 0;
    server.use(
      http.post('*/api/v1/posts', () => {
        creates += 1;
        return HttpResponse.json(post(), { status: 201 });
      })
    );
    renderEditorApp('/posts/new');
    await screen.findByRole('textbox', { name: /Заголовок/ });
    await new Promise((resolve) => window.setTimeout(resolve, 1_400));
    expect(creates).toBe(0);
  });

  it('autosaves a new post after the first valid title without a manual save action', async () => {
    const user = userEvent.setup();
    let creates = 0;
    server.use(
      http.post('*/api/v1/posts', () => {
        creates += 1;
        return HttpResponse.json(post({ title: 'Новая публикация' }), { status: 201 });
      })
    );
    const { router } = renderEditorApp('/posts/new');
    await user.type(await screen.findByRole('textbox', { name: /Заголовок/ }), 'Новая публикация');

    await waitFor(() => expect(router.state.location.pathname).toBe(`/posts/${ids.post}`), { timeout: 5_000 });
    expect(creates).toBe(1);
  });

  it('shows an editable default title and autosaves when body text is entered first', async () => {
    const user = userEvent.setup();
    let createdTitle: string | undefined;
    server.use(
      http.post('*/api/v1/posts', async ({ request }) => {
        const input = (await request.json()) as { title: string; body: string };
        createdTitle = input.title;
        return HttpResponse.json(post(input), { status: 201 });
      })
    );
    const { router } = renderEditorApp('/posts/new');
    await user.type(await screen.findByRole('textbox', { name: 'Текст' }), 'Сначала текст');

    await waitFor(() => expect(router.state.location.pathname).toBe(`/posts/${ids.post}`), { timeout: 5_000 });
    expect(createdTitle).toMatch(/^Публикация от /);
    expect((screen.getByRole('textbox', { name: /Заголовок/ }) as HTMLInputElement).value).toBe(createdTitle);
  });

  it('saves and continues to publication settings without approving', async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    server.use(
      http.post('*/api/v1/posts', () => {
        calls.push('create');
        return HttpResponse.json(post({ title: 'Новый пост' }), { status: 201 });
      }),
      http.post('*/api/v1/posts/:id/approve', () => {
        calls.push('approve');
        return HttpResponse.json(post({ title: 'Новый пост', status: 'approved', revision: 1 }));
      })
    );
    const { router } = renderEditorApp('/posts/new');
    await user.type(await screen.findByRole('textbox', { name: /Заголовок/ }), 'Новый пост');
    await user.click(screen.getByRole('button', { name: 'К публикации' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/posts/${ids.post}/publish`));
    // Approval belongs to the publish screen, together with the send.
    expect(calls).toEqual(['create']);
  });

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
    await user.keyboard('{Control>}s{/Control}');

    await waitFor(() => expect(router.state.location.pathname).toBe(`/posts/${ids.post}`));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.key).toBeTruthy();
    expect(seen[0]?.body).toEqual({ title: 'Новый', body: 'Текст', entities: [] });
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
    await screen.findByRole('textbox', { name: /Заголовок/ });
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByText('Введите заголовок')).toBeTruthy();
    expect(titleBox().getAttribute('aria-invalid')).toBe('true');
    expect(calls).toBe(0);
    expect(bodyBox().textContent).toBe('');
  });
});

describe('save', () => {
  it('leaves a clean draft for the posts list without another request', async () => {
    const user = userEvent.setup();
    let patches = 0;
    server.use(
      http.patch('*/api/v1/posts/:id', () => {
        patches += 1;
        return HttpResponse.json(post({ revision: 1 }));
      })
    );
    const { router } = await openExisting();
    const saveAndExit = screen.getByRole('button', { name: 'К постам' });
    expect(saveAndExit.hasAttribute('disabled')).toBe(false);
    await user.click(saveAndExit);
    await waitFor(() => expect(router.state.location.pathname).toBe('/posts'));
    expect(patches).toBe(0);
  });

  it('saves a changed draft before leaving for the posts list', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    server.use(
      http.patch('*/api/v1/posts/:id', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(post({ revision: 1, body: 'Правка' }));
      })
    );
    const { router } = await openExisting();
    await replaceBody(user, 'Правка');
    await user.click(screen.getByRole('button', { name: 'К постам' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/posts'));
    expect(bodies).toEqual([{ revision: 0, body: 'Правка', entities: [] }]);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('stays in the editor if newer text was entered while saving', async () => {
    const user = userEvent.setup();
    let complete: (() => void) | undefined;
    server.use(
      http.patch('*/api/v1/posts/:id', async () => {
        await new Promise<void>((resolve) => {
          complete = resolve;
        });
        return HttpResponse.json(post({ revision: 1, body: 'Правка' }));
      })
    );
    const { router } = await openExisting();
    await replaceBody(user, 'Правка');
    await user.click(screen.getByRole('button', { name: 'К постам' }));
    await waitFor(() => expect(complete).toBeDefined());
    await typeAtEnd(user, '!');
    complete?.();
    await waitFor(() => expect(screen.getByText('Есть несохранённые изменения')).toBeTruthy());
    expect(router.state.location.pathname).toBe(`/posts/${ids.post}`);
    expect(bodyBox().textContent).toBe('Правка!');
  });

  it('autosaves a valid existing draft after editing without leaving the page', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    server.use(
      http.patch('*/api/v1/posts/:id', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(post({ revision: 1, body: 'Автосохранено' }));
      })
    );
    const { router } = await openExisting();

    await replaceBody(user, 'Автосохранено');

    await waitFor(() => expect(bodies).toEqual([{ revision: 0, body: 'Автосохранено', entities: [] }]), {
      timeout: 2_500
    });
    expect(await screen.findByText(/Сохранено в/)).toBeTruthy();
    expect(screen.queryByText('Ревизия 1')).toBeNull();
    expect(router.state.location.pathname).toBe(`/posts/${ids.post}`);
  });

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
    await replaceBody(user, 'Правка');
    expect(screen.getByText('Есть несохранённые изменения')).toBeTruthy();
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(bodies).toEqual([{ revision: 0, body: 'Правка', entities: [] }]));
    expect(await screen.findByText(/Сохранено в/)).toBeTruthy();
    expect(screen.queryByText('Ревизия 1')).toBeNull();
  });

  it('shows a persistent error with the requestId and keeps the text when the server is down', async () => {
    const user = userEvent.setup();
    await openExisting();
    server.use(failWith('patch', `/api/v1/posts/${ids.post}`, { status: 503, code: 'UNAVAILABLE' }));
    await typeAtEnd(user, ' дополнение');
    await user.click(screen.getByRole('button', { name: 'К постам' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('req-test-1');
    expect(alert.textContent).toContain('Ваш текст остался в редакторе');
    expect(bodyBox().textContent).toBe('Текст поста дополнение');
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
    await replaceBody(user, 'Мой текст');
    await user.click(screen.getByRole('button', { name: 'К постам' }));

    const banner = await screen.findByText('Пост уже изменён в другом месте');
    expect(banner).toBeTruthy();
    expect(bodyBox().textContent).toBe('Мой текст');

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
        { revision: 0, body: 'Мой текст', entities: [] },
        { revision: 3, title: 'Заголовок', body: 'Мой текст', entities: [] }
      ])
    );
    await waitFor(() => expect(screen.queryByText('Пост уже изменён в другом месте')).toBeNull());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('revision history removal', () => {
  it('does not show history controls or request prior snapshots', async () => {
    let historyRequests = 0;
    server.use(
      http.get('*/api/v1/posts/:id/revisions', () => {
        historyRequests += 1;
        return HttpResponse.json({ items: [], nextCursor: null });
      })
    );
    await openExisting();

    expect(screen.queryByRole('button', { name: /истори|ревизи/i })).toBeNull();
    expect(historyRequests).toBe(0);
  });
});

describe('approve', () => {
  it('allows a title and media without body text to continue to publication settings', async () => {
    const user = userEvent.setup();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:editor-media');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const approvals: unknown[] = [];
    server.use(
      http.get(
        '*/api/v1/media/:id/content',
        () => new HttpResponse(new Uint8Array([1]), { headers: { 'Content-Type': 'image/jpeg' } })
      ),
      http.post('*/api/v1/posts/:id/approve', async ({ request }) => {
        approvals.push(await request.json());
        return HttpResponse.json(post({ body: '', status: 'approved', revision: 1 }));
      })
    );
    const { router } = await openExisting({
      body: '',
      media: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          sourceMediaId: null,
          kind: 'photo',
          fileName: 'photo.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 42,
          width: 1,
          height: 1,
          durationMs: null,
          position: 0
        }
      ]
    });
    await user.click(screen.getByRole('button', { name: 'К публикации' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/posts/${ids.post}/publish`));
    expect(approvals).toEqual([]);
  });

  it('goes to the publish screen without approving the draft', async () => {
    const user = userEvent.setup();
    const approvals: unknown[] = [];
    server.use(
      http.post('*/api/v1/posts/:id/approve', async ({ request }) => {
        approvals.push(await request.json());
        return HttpResponse.json(post({ revision: 1, status: 'approved' }));
      })
    );
    server.use(http.get('*/api/v1/posts/:id', () => HttpResponse.json(post())));
    const app = renderEditorApp(`/posts/${ids.post}`);
    await screen.findByRole('textbox', { name: 'Текст' });
    await user.click(screen.getByRole('button', { name: 'К публикации' }));
    await waitFor(() => expect(app.router.state.location.pathname).toBe(`/posts/${ids.post}/publish`));
    expect(approvals).toEqual([]);
    expect(await screen.findByRole('heading', { name: 'Настройки публикации' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Заголовок' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Текст' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'К постам' })).toBeNull();
  });

  it('opens an already approved post read-only with the explanation and the publish slot', async () => {
    server.use(http.get('*/api/v1/posts/:id', () => HttpResponse.json(post({ status: 'approved', revision: 2 }))));
    renderEditorApp(`/posts/${ids.post}`, () => <button type="button">Опубликовать</button>);
    expect(await screen.findByText('Пост готов к публикации')).toBeTruthy();
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
    await typeAtEnd(user, '!');
    await user.click(screen.getByRole('button', { name: 'К постам' }));
    expect(await screen.findByText('Пост уже одобрен в другом месте')).toBeTruthy();
    expect(bodyBox().textContent).toBe('Текст поста!');
    expect(bodyBox().getAttribute('aria-readonly')).toBe('true');
    expect(bodyBox().getAttribute('contenteditable')).toBe('false');
  });
});

describe('leave guard', () => {
  it('asks before leaving with unsaved text; staying keeps the text, leaving navigates', async () => {
    const user = userEvent.setup();
    const { router } = await openExisting();
    await typeAtEnd(user, '!');
    await user.click(screen.getByRole('link', { name: 'Уйти' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Выйти без сохранения?' });
    await user.click(within(dialog).getByRole('button', { name: 'Остаться' }));
    expect(router.state.location.pathname).toBe(`/posts/${ids.post}`);
    expect(bodyBox().textContent).toBe('Текст поста!');

    await user.click(screen.getByRole('link', { name: 'Уйти' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Выйти без сохранения' })
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/media'));
  });

  it('does not interfere when nothing changed and warns on tab close only while dirty', async () => {
    const user = userEvent.setup();
    server.use(http.get('*/api/v1/posts/:id', () => HttpResponse.json(post())));
    renderEditorApp(`/posts/${ids.post}`, undefined, { browserHistory: true });
    await screen.findByRole('textbox', { name: 'Текст' });
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    await typeAtEnd(user, '!');
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
    expect(document.body.textContent).toContain('В сообщении 106 из 4096 символов');
  });

  it('warns when title and body together exceed Telegram, keeps saving possible, and blocks approval', async () => {
    const user = userEvent.setup();
    await openExisting({ title: 'Заголовок', body: '' });
    await user.click(bodyBox());
    await user.paste('b'.repeat(POST_BODY_MAX - 5));
    expect(await screen.findByText(/Сообщение длиннее лимита Telegram на 6/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'К постам' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'К публикации' }).hasAttribute('disabled')).toBe(true);
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
