import { DEFAULT_SEND_OPTIONS } from '@alexeev/contracts';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, errorBody, ids, post } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { renderEditorApp } from './harness';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const poll = { question: 'Какой формат?', options: ['Раз', 'Два'], allowsMultipleAnswers: false, quiz: null };
const pollPost = (overrides = {}) => post({ kind: 'poll', title: 'Какой формат?', body: '', poll, ...overrides });

async function openPost(overrides = {}) {
  server.use(http.get('*/api/v1/posts/:id', () => HttpResponse.json(overrides === null ? post() : overrides)));
  renderEditorApp(`/posts/${ids.post}`);
  await screen.findByRole('tablist', { name: 'Тип публикации' });
}

const tab = (name: string) => screen.getByRole('tab', { name });

describe('poll form', () => {
  it('autosaves an edited question as PATCH {revision, poll} and nothing else', async () => {
    const user = userEvent.setup();
    const patches: unknown[] = [];
    server.use(
      http.patch('*/api/v1/posts/:id', async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json(pollPost({ revision: 1 }));
      })
    );
    await openPost(pollPost());
    await user.type(screen.getByRole('textbox', { name: /Вопрос/ }), '!');
    await waitFor(() => expect(patches).toHaveLength(1), { timeout: 4000 });
    expect(patches[0]).toEqual({ revision: 0, poll: { ...poll, question: 'Какой формат?!' } });
  });

  it('keeps «К публикации» disabled while the poll has an issue and shows it in Russian', async () => {
    const user = userEvent.setup();
    await openPost(pollPost({ poll: { ...poll, options: ['Раз', 'Раз'] } }));
    expect(screen.getByText('Варианты ответов не должны повторяться.')).toBeTruthy();
    const next = screen.getByRole('button', { name: 'К публикации' });
    expect(next.hasAttribute('disabled')).toBe(true);
    const second = screen.getByRole('textbox', { name: 'Вариант 2' });
    await user.clear(second);
    await user.type(second, 'Два');
    expect(screen.getByText('Опрос готов к публикации.')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'К публикации' }).hasAttribute('disabled')).toBe(false)
    );
  });

  it('makes quiz and several answers exclusive', async () => {
    const user = userEvent.setup();
    await openPost(pollPost());
    await user.click(screen.getByRole('switch', { name: /Режим викторины/ }));
    expect(screen.getByRole('switch', { name: /Несколько ответов/ }).hasAttribute('disabled')).toBe(true);
  });

  it('creates a poll post from the poll tab of a new post', async () => {
    const user = userEvent.setup();
    const posts: unknown[] = [];
    server.use(
      http.post('*/api/v1/posts', async ({ request }) => {
        posts.push(await request.json());
        return HttpResponse.json(pollPost(), { status: 201 });
      })
    );
    renderEditorApp('/posts/new');
    await user.click(await screen.findByRole('tab', { name: 'Опрос' }));
    await user.type(screen.getByRole('textbox', { name: /Вопрос/ }), 'Какой формат?');
    await waitFor(() => expect(posts).toHaveLength(1), { timeout: 4000 });
    expect(posts[0]).toMatchObject({ kind: 'poll', poll: { question: 'Какой формат?' } });
    expect(posts[0]).not.toHaveProperty('body');
  });

  it('says a saved text post cannot become a poll', async () => {
    const user = userEvent.setup();
    await openPost(post());
    await user.click(tab('Опрос'));
    expect(screen.getByText('Это текстовый пост')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Создать опрос' })).toBeTruthy();
  });
});

describe('send options', () => {
  it('saves a switched option as PATCH {revision, sendOptions}', async () => {
    const user = userEvent.setup();
    const patches: unknown[] = [];
    server.use(
      http.patch('*/api/v1/posts/:id', async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json(post({ revision: 1 }));
      })
    );
    await openPost(post());
    await user.click(tab('Настройки'));
    await user.click(screen.getByRole('switch', { name: /Без звука/ }));
    await waitFor(() => expect(patches).toHaveLength(1), { timeout: 4000 });
    expect(patches[0]).toEqual({
      revision: 0,
      sendOptions: { ...DEFAULT_SEND_OPTIONS, silent: true }
    });
  });

  it('disables the link preview switch for a poll and says why', async () => {
    const user = userEvent.setup();
    await openPost(pollPost());
    await user.click(tab('Настройки'));
    expect(screen.getByRole('switch', { name: /Предпросмотр ссылок/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/Только для текста без фото и видео/)).toBeTruthy();
  });
});

describe('server refusals', () => {
  it.each([
    ['KIND_MISMATCH', /Тип поста не меняется/],
    ['POLL_INVALID', /Сервер не принял опрос/]
  ])('shows %s as a message and keeps the typed poll', async (reason, message) => {
    const user = userEvent.setup();
    server.use(
      http.patch('*/api/v1/posts/:id', () =>
        HttpResponse.json(errorBody('VALIDATION_ERROR', { reason }), { status: 400 })
      )
    );
    await openPost(pollPost());
    const question = screen.getByRole('textbox', { name: /Вопрос/ });
    await user.type(question, '!');
    expect(await screen.findByText(message, undefined, { timeout: 4000 })).toBeTruthy();
    expect((question as HTMLTextAreaElement).value).toBe('Какой формат?!');
  });
});
