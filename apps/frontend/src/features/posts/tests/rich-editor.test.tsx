import type { PostEntity } from '@alexeev/contracts';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, errorBody, ids, post } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { clearViewport, setViewport } from '../../../test/viewport';
import { renderEditorApp } from './harness';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(() => {
  cleanup();
  clearViewport();
});

type User = ReturnType<typeof userEvent.setup>;

const bodyBox = () => screen.getByRole('textbox', { name: 'Текст' });
const button = (name: string) => screen.getByRole('button', { name });

async function openExisting(overrides = {}) {
  server.use(http.get('*/api/v1/posts/:id', () => HttpResponse.json(post(overrides))));
  const app = renderEditorApp(`/posts/${ids.post}`);
  await screen.findByRole('textbox', { name: 'Текст' });
  return app;
}

/** Selects characters [start, end) of the first paragraph the way a drag would, then tells ProseMirror. */
function selectRange(start: number, end: number) {
  const paragraph = bodyBox().querySelector('p');
  if (!paragraph) throw new Error('no paragraph to select');
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  const point = (offset: number) => {
    let left = offset;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = node.textContent?.length ?? 0;
      if (left <= length) return { node, offset: left };
      left -= length;
    }
    throw new Error('offset beyond the paragraph');
  };
  walker.currentNode = paragraph;
  const from = point(start);
  walker.currentNode = paragraph;
  const to = point(end);
  bodyBox().focus();
  window.getSelection()?.setBaseAndExtent(from.node, from.offset, to.node, to.offset);
  document.dispatchEvent(new Event('selectionchange'));
}

async function selectAll(user: User) {
  bodyBox().focus();
  await user.keyboard('{Control>}a{/Control}');
}

/** Records every PATCH body and answers with the post the server would store. */
function capturePatches(reply: (body: Record<string, unknown>) => Parameters<typeof post>[0]) {
  const bodies: Array<Record<string, unknown>> = [];
  server.use(
    http.patch('*/api/v1/posts/:id', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      bodies.push(body);
      return HttpResponse.json(post({ revision: 1, ...reply(body) }));
    })
  );
  return bodies;
}

describe('toolbar', () => {
  it('keeps the link target in the 320px compact toolbar row', async () => {
    setViewport(320);
    await openExisting();

    const toolbar = screen.getByRole('toolbar', { name: 'Форматирование текста' });
    const link = within(toolbar).getByRole('button', { name: 'Ссылка' });
    const more = within(toolbar).getByRole('button', { name: 'Ещё форматирование' });

    expect(link.parentElement?.getAttribute('role')).toBe('presentation');
    expect(more.parentElement).toBe(link.parentElement);
    expect(link.getAttribute('aria-pressed')).toBe('false');
  });

  it('exposes a labelled toolbar whose buttons report their state', async () => {
    const user = userEvent.setup();
    await openExisting();
    const toolbar = screen.getByRole('toolbar', { name: 'Форматирование текста' });
    for (const name of [
      'Жирный',
      'Курсив',
      'Подчёркнутый',
      'Зачёркнутый',
      'Спойлер',
      'Ссылка',
      'Код в строке',
      'Блок кода',
      'Цитата'
    ]) {
      expect(within(toolbar).getByRole('button', { name }).getAttribute('aria-pressed')).toBe('false');
    }
    await selectAll(user);
    await user.click(button('Жирный'));
    expect(button('Жирный').getAttribute('aria-pressed')).toBe('true');
    expect(bodyBox().querySelector('strong')?.textContent).toBe('Текст поста');
    await user.click(button('Жирный'));
    expect(button('Жирный').getAttribute('aria-pressed')).toBe('false');
    expect(bodyBox().querySelector('strong')).toBeNull();
  });

  it('keeps focus in the editor after a press, so typing continues', async () => {
    const user = userEvent.setup();
    await openExisting();
    await selectAll(user);
    await user.click(button('Курсив'));
    expect(document.activeElement).toBe(bodyBox());
  });

  it.each([
    ['{Control>}b{/Control}', 'Жирный'],
    ['{Control>}i{/Control}', 'Курсив'],
    ['{Control>}u{/Control}', 'Подчёркнутый'],
    ['{Control>}{Shift>}x{/Shift}{/Control}', 'Зачёркнутый'],
    ['{Control>}{Shift>}p{/Shift}{/Control}', 'Спойлер'],
    ['{Control>}e{/Control}', 'Код в строке']
  ])('toggles with the shortcut %s', async (keys, name) => {
    const user = userEvent.setup();
    await openExisting();
    await selectAll(user);
    await user.keyboard(keys);
    expect(button(name).getAttribute('aria-pressed')).toBe('true');
    await user.keyboard(keys);
    expect(button(name).getAttribute('aria-pressed')).toBe('false');
  });

  it('inserts and removes list prefixes as plain text', async () => {
    const user = userEvent.setup();
    const bodies = capturePatches((body) => ({ body: String(body['body']) }));
    await openExisting();
    await selectAll(user);
    await user.click(button('Маркированный список'));
    expect(bodyBox().textContent).toBe('• Текст поста');
    await user.click(button('Маркированный список'));
    expect(bodyBox().textContent).toBe('Текст поста');
    await user.click(button('Нумерованный список'));
    expect(bodyBox().textContent).toBe('1. Текст поста');
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ revision: 0, body: '1. Текст поста', entities: [] });
  });

  it('puts the quote and the code block in the saved entities', async () => {
    const user = userEvent.setup();
    const bodies = capturePatches(() => ({}));
    await openExisting();
    await selectAll(user);
    await user.click(button('Цитата'));
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]?.['entities']).toEqual([{ type: 'blockquote', offset: 0, length: 11 }]);
  });
});

describe('save', () => {
  it('sends the entities with the body on Ctrl+S', async () => {
    const user = userEvent.setup();
    const bodies = capturePatches((body) => ({
      body: String(body['body']),
      entities: body['entities'] as PostEntity[]
    }));
    await openExisting({ body: 'Привет 😀 мир' });
    selectRange(7, 9);
    await user.keyboard('{Control>}b{/Control}');
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      revision: 0,
      body: 'Привет 😀 мир',
      entities: [{ type: 'bold', offset: 7, length: 2 }]
    });
    expect(await screen.findByText(/Сохранено в/)).toBeTruthy();
  });

  it('sends a formatting-only change together with the unchanged body', async () => {
    const user = userEvent.setup();
    const bodies = capturePatches(() => ({}));
    await openExisting();
    await selectAll(user);
    await user.keyboard('{Control>}i{/Control}{Control>}s{/Control}');
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      revision: 0,
      body: 'Текст поста',
      entities: [{ type: 'italic', offset: 0, length: 11 }]
    });
  });

  it('creates a draft with entities', async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    server.use(
      http.post('*/api/v1/posts', async ({ request }) => {
        seen.push(await request.json());
        return HttpResponse.json(post({ title: 'Новый' }), { status: 201 });
      })
    );
    renderEditorApp('/posts/new');
    await user.type(await screen.findByRole('textbox', { name: /Заголовок/ }), 'Новый');
    await user.click(bodyBox());
    await user.keyboard('{Control>}b{/Control}жирно');
    await user.click(screen.getByRole('button', { name: 'Создать черновик' }));
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toEqual({
      title: 'Новый',
      body: 'жирно',
      entities: [{ type: 'bold', offset: 0, length: 5 }]
    });
  });

  it('keeps formatting and offers the comparison on a 409, and overwrites with the entities', async () => {
    const user = userEvent.setup();
    const patches: Array<Record<string, unknown>> = [];
    server.use(
      http.patch('*/api/v1/posts/:id', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        patches.push(body);
        return body['revision'] === 0
          ? HttpResponse.json(errorBody('CONFLICT', { reason: 'STALE_REVISION' }), { status: 409 })
          : HttpResponse.json(post({ revision: 4 }));
      })
    );
    await openExisting();
    server.use(http.get('*/api/v1/posts/:id', () => HttpResponse.json(post({ revision: 3, body: 'Чужой текст' }))));
    await selectAll(user);
    await user.keyboard('{Control>}b{/Control}{Control>}s{/Control}');

    expect(await screen.findByText('Пост уже изменён в другом месте')).toBeTruthy();
    expect(bodyBox().querySelector('strong')?.textContent).toBe('Текст поста');
    expect(patches).toHaveLength(1);

    await user.click(await screen.findByRole('button', { name: 'Перезаписать моими' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Перезаписать' }));
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[1]).toEqual({
      revision: 3,
      title: 'Заголовок',
      body: 'Текст поста',
      entities: [{ type: 'bold', offset: 0, length: 11 }]
    });
  });

  it('shows the server reason in Russian and keeps the formatted text when the entities are refused', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch('*/api/v1/posts/:id', () =>
        HttpResponse.json(errorBody('VALIDATION_ERROR', { reason: 'ENTITIES_SPLIT_SURROGATE' }), { status: 400 })
      )
    );
    await openExisting();
    await selectAll(user);
    await user.keyboard('{Control>}b{/Control}{Control>}s{/Control}');
    expect(await screen.findByText(/Выделение режет эмодзи пополам/)).toBeTruthy();
    expect(bodyBox().querySelector('strong')).not.toBeNull();
    expect(screen.getByText('Не сохранено')).toBeTruthy();
  });

  it('saves styles that start and end in different places as nested pieces', async () => {
    const user = userEvent.setup();
    const bodies = capturePatches(() => ({}));
    await openExisting({ body: 'abcdef' });
    selectRange(0, 4);
    await user.keyboard('{Control>}b{/Control}');
    selectRange(2, 6);
    await user.keyboard('{Control>}i{/Control}');
    expect(screen.queryByText(/не поддерживает/)).toBeNull();
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]?.['body']).toBe('abcdef');
    expect(bodies[0]?.['entities']).toEqual([
      { type: 'bold', offset: 0, length: 4 },
      { type: 'italic', offset: 2, length: 2 },
      { type: 'italic', offset: 4, length: 2 }
    ]);
  });
});

describe('existing post', () => {
  it('shows stored entities in the editor and the preview', async () => {
    await openExisting({
      body: 'жирный и ссылка',
      entities: [
        { type: 'bold', offset: 0, length: 6 },
        { type: 'text_link', offset: 9, length: 6, url: 'https://example.com/' }
      ]
    });
    expect(bodyBox().querySelector('strong')?.textContent).toBe('жирный');
    expect(bodyBox().querySelector('a')?.getAttribute('href')).toBe('https://example.com/');
    const preview = screen.getByRole('figure', { name: 'Предпросмотр в Telegram' });
    expect(within(preview).getByText('жирный').tagName).toBe('STRONG');
    expect(within(preview).getByRole('link', { name: 'ссылка' }).getAttribute('href')).toBe('https://example.com/');
  });

  it('renders an approved post read-only with its formatting', async () => {
    server.use(
      http.get('*/api/v1/posts/:id', () =>
        HttpResponse.json(
          post({ status: 'approved', body: 'жирный текст', entities: [{ type: 'bold', offset: 0, length: 6 }] })
        )
      )
    );
    renderEditorApp(`/posts/${ids.post}`);
    expect(await screen.findByText('Пост одобрен и закрыт для правок')).toBeTruthy();
    const preview = screen.getByRole('figure', { name: 'Предпросмотр в Telegram' });
    expect(within(preview).getByText('жирный').tagName).toBe('STRONG');
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Текст' })).toBeNull();
  });

  it('is read-only without a toolbar when a lock arrives with the typed text kept', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch('*/api/v1/posts/:id', () =>
        HttpResponse.json(errorBody('CONFLICT', { reason: 'NOT_EDITABLE' }), { status: 409 })
      ),
      http.get('*/api/v1/posts/:id', () => HttpResponse.json(post({ status: 'approved', revision: 2 })))
    );
    await openExisting();
    await selectAll(user);
    await user.keyboard('{Control>}b{/Control}{Control>}s{/Control}');
    await screen.findByText('Пост уже одобрен в другом месте');
    expect(bodyBox().getAttribute('contenteditable')).toBe('false');
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(bodyBox().querySelector('strong')?.textContent).toBe('Текст поста');
  });
});

describe('link dialog', () => {
  it('validates the address in Russian, then links the selection with a normalized address', async () => {
    const user = userEvent.setup();
    const bodies = capturePatches(() => ({}));
    await openExisting({ body: 'смотри сайт' });
    selectRange(7, 11);
    await user.click(button('Ссылка'));
    const dialog = await screen.findByRole('dialog', { name: 'Ссылка' });
    const address = within(dialog).getByRole('textbox', { name: 'Адрес' });

    await user.click(within(dialog).getByRole('button', { name: 'Применить' }));
    expect(await within(dialog).findByText('Введите адрес ссылки')).toBeTruthy();

    await user.type(address, 'javascript:alert(1)');
    await user.click(within(dialog).getByRole('button', { name: 'Применить' }));
    expect(await within(dialog).findByText(/должен начинаться с http/)).toBeTruthy();

    await user.clear(address);
    await user.type(address, 'Example.com/path{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(bodyBox().querySelector('a')?.getAttribute('href')).toBe('https://example.com/path');
    await waitFor(() => expect(document.activeElement).toBe(bodyBox()));

    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]?.['entities']).toEqual([
      { type: 'text_link', offset: 7, length: 4, url: 'https://example.com/path' }
    ]);
  });

  it('opens with Ctrl+K, cancels with Escape and returns focus to the editor', async () => {
    const user = userEvent.setup();
    await openExisting();
    await selectAll(user);
    await user.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('dialog', { name: 'Ссылка' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(bodyBox()));
    expect(bodyBox().querySelector('a')).toBeNull();
  });

  it('edits and removes the link under the caret', async () => {
    const user = userEvent.setup();
    await openExisting({
      body: 'сайт',
      entities: [{ type: 'text_link', offset: 0, length: 4, url: 'https://old.example/' }]
    });
    selectRange(1, 1);
    await user.click(button('Ссылка'));
    const dialog = await screen.findByRole('dialog', { name: 'Ссылка' });
    expect((within(dialog).getByRole('textbox', { name: 'Адрес' }) as HTMLInputElement).value).toBe(
      'https://old.example/'
    );
    await user.click(within(dialog).getByRole('button', { name: 'Убрать ссылку' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(bodyBox().querySelector('a')).toBeNull();
    expect(bodyBox().textContent).toBe('сайт');
  });

  it('asks for the link text when nothing is selected', async () => {
    const user = userEvent.setup();
    await openExisting({ body: '' });
    await user.click(bodyBox());
    await user.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Ссылка' });
    await user.click(within(dialog).getByRole('button', { name: 'Применить' }));
    expect(await within(dialog).findByText('Введите текст ссылки')).toBeTruthy();
    await user.type(within(dialog).getByRole('textbox', { name: 'Текст ссылки' }), 'сайт');
    await user.type(within(dialog).getByRole('textbox', { name: 'Адрес' }), 'tg://resolve?domain=durov');
    await user.click(within(dialog).getByRole('button', { name: 'Применить' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(bodyBox().querySelector('a')?.textContent).toBe('сайт');
    expect(bodyBox().querySelector('a')?.getAttribute('href')).toBe('tg://resolve?domain=durov');
  });
});

describe('code block language', () => {
  it('is available only inside a code block and is validated', async () => {
    const user = userEvent.setup();
    const bodies = capturePatches(() => ({}));
    await openExisting({ body: 'let a = 1;' });
    expect(button('Язык кода').hasAttribute('disabled')).toBe(true);
    await selectAll(user);
    await user.click(button('Блок кода'));
    await waitFor(() => expect(button('Язык кода').hasAttribute('disabled')).toBe(false));
    await user.click(button('Язык кода'));
    const dialog = await screen.findByRole('dialog', { name: 'Язык кода' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Язык' }), 'не язык!');
    await user.click(within(dialog).getByRole('button', { name: 'Применить' }));
    expect(await within(dialog).findByText(/латиницей, цифрами/)).toBeTruthy();
    await user.clear(within(dialog).getByRole('textbox', { name: 'Язык' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Язык' }), 'ts{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]?.['entities']).toEqual([{ type: 'pre', offset: 0, length: 10, language: 'ts' }]);
  });
});

function paste(html: string, plain: string) {
  fireEvent.paste(bodyBox(), {
    clipboardData: {
      types: ['text/html', 'text/plain'],
      getData: (type: string) => (type === 'text/html' ? html : type === 'text/plain' ? plain : ''),
      files: [],
      items: []
    }
  });
}

describe('paste', () => {
  it('keeps supported marks and flattens everything else to text', async () => {
    const user = userEvent.setup();
    const bodies = capturePatches(() => ({}));
    await openExisting({ body: '' });
    bodyBox().focus();
    paste(
      '<h1>Заголовок</h1><p><b>жирный</b> <span style="color:red;font-size:30px">красный</span> ' +
        '<a href="javascript:alert(1)">опасный</a> <a href="https://example.com/x">ссылка</a></p>' +
        '<ul><li>пункт</li></ul><img src="https://example.com/a.png" alt="картинка">',
      'fallback'
    );
    const box = bodyBox();
    expect(box.querySelector('h1, ul, li, img, font')).toBeNull();
    expect(box.querySelector('[style]')).toBeNull();
    expect(box.querySelector('strong')?.textContent).toBe('жирный');
    expect(box.querySelectorAll('a')).toHaveLength(1);
    expect(box.textContent).toContain('красный');
    expect(box.textContent).toContain('опасный');
    expect(box.textContent).toContain('пункт');

    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(bodies).toHaveLength(1));
    const entities = bodies[0]?.['entities'] as PostEntity[];
    expect(new Set(entities.map((entity) => entity.type))).toEqual(new Set(['bold', 'text_link']));
  });
});
