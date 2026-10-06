import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, getAccessToken } from '../../../shared/api/session';
import { accessToken, errorBody, widgetUser } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { SignInPanel } from '../ui/SignInPanel';

setupMswServer();

beforeEach(() => clearSession());
afterEach(() => {
  cleanup();
  clearSession();
  vi.unstubAllGlobals();
});

function renderPanel(options: { botUsername?: string | undefined } = { botUsername: 'test_bot' }) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <SignInPanel botUsername={options.botUsername} />
    </QueryClientProvider>
  );
}

const widgetScript = () => document.querySelector<HTMLScriptElement>('script[data-telegram-login]');

/** Plays the part of telegram-widget.js: inserts its iframe next to the script, then posts a message from it. */
function telegramSays(payload: unknown, origin = 'https://oauth.telegram.org') {
  const script = widgetScript()!;
  let iframe = script.parentElement!.querySelector('iframe');
  if (!iframe) {
    iframe = document.createElement('iframe');
    script.before(iframe);
  }
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', { origin, source: iframe.contentWindow, data: JSON.stringify(payload) })
    );
  });
}

const ready = () => telegramSays({ event: 'ready' });
const authUser = (user: unknown) => telegramSays({ event: 'auth_user', auth_data: user });

describe('login widget', () => {
  it('loads the official script in callback-less embed mode: bot from the build, never data-auth-url or data-onauth', () => {
    renderPanel();
    const script = widgetScript()!;
    expect(script.src).toBe('https://telegram.org/js/telegram-widget.js?22');
    expect(script.dataset['telegramLogin']).toBe('test_bot');
    expect(script.hasAttribute('data-auth-url')).toBe(false);
    expect(script.hasAttribute('data-onauth')).toBe(false);
    expect(screen.getByText('Загружаем кнопку входа через Telegram…')).toBeTruthy();
  });

  it('posts the user object unchanged and stores the session in memory', async () => {
    let body: unknown;
    server.use(
      http.post('*/api/v1/auth/telegram-widget', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(accessToken('widget-ok'));
      })
    );
    renderPanel();
    ready();
    authUser(widgetUser);
    await waitFor(() => expect(getAccessToken()).toBe('widget-ok'));
    expect(body).toEqual(widgetUser);
    expect(window.localStorage.length).toBe(0);
  });

  it('ignores messages from another origin or another window', () => {
    renderPanel();
    let called = false;
    server.use(
      http.post('*/api/v1/auth/telegram-widget', () => {
        called = true;
        return HttpResponse.json(accessToken());
      })
    );
    telegramSays({ event: 'auth_user', auth_data: widgetUser }, 'https://evil.example');
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://oauth.telegram.org',
          source: window,
          data: JSON.stringify({ event: 'auth_user', auth_data: widgetUser })
        })
      );
    });
    expect(called).toBe(false);
    expect(getAccessToken()).toBeNull();
  });

  it.each([
    [401, 'UNAUTHORIZED', 'Подтверждение устарело или недействительно'],
    [403, 'FORBIDDEN', 'Нет доступа'],
    [503, 'UNAVAILABLE', 'Сервис входа недоступен']
  ] as const)('explains a %s without a session', async (status, code, title) => {
    server.use(http.post('*/api/v1/auth/telegram-widget', () => HttpResponse.json(errorBody(code), { status })));
    renderPanel();
    ready();
    authUser(widgetUser);
    expect(await screen.findByText(title)).toBeTruthy();
    expect(getAccessToken()).toBeNull();
    expect(widgetScript()).not.toBeNull();
  });

  it('shows the Retry-After wait on 429 and enables retry only after it', async () => {
    server.use(
      http.post('*/api/v1/auth/telegram-widget', () =>
        HttpResponse.json(errorBody('RATE_LIMIT'), { status: 429, headers: { 'Retry-After': '2' } })
      )
    );
    renderPanel();
    ready();
    authUser(widgetUser);
    expect(await screen.findByText('Слишком много попыток входа')).toBeTruthy();
    expect(screen.getByText('Подождите примерно 2 с и попробуйте снова.')).toBeTruthy();
    const button = screen.getByRole('button', { name: /Повторить через/ });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(widgetScript()).toBeNull();
    const user = userEvent.setup();
    const enabled = await screen.findByRole('button', { name: 'Повторить' }, { timeout: 4000 });
    await user.click(enabled);
    expect(widgetScript()).not.toBeNull();
  });

  it('reports a cancelled sign-in without calling the server', async () => {
    renderPanel();
    ready();
    telegramSays({ event: 'auth_user', auth_data: false });
    expect(await screen.findByText('Вход отменён')).toBeTruthy();
  });

  it('refuses malformed Telegram data locally', async () => {
    renderPanel();
    ready();
    authUser({ id: 'not-a-number' });
    expect(await screen.findByText('Telegram вернул неполные данные')).toBeTruthy();
  });

  it('shows a retryable error when the widget script is blocked', async () => {
    const user = userEvent.setup();
    renderPanel();
    act(() => {
      widgetScript()!.dispatchEvent(new Event('error'));
    });
    expect(await screen.findByText('Не удалось загрузить вход через Telegram')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(widgetScript()).not.toBeNull();
    expect(screen.queryByText('Не удалось загрузить вход через Telegram')).toBeNull();
  });

  it('explains a missing bot name instead of rendering a dead widget', () => {
    renderPanel({ botUsername: undefined });
    expect(screen.getByText('Не задан бот для входа')).toBeTruthy();
    expect(widgetScript()).toBeNull();
  });

  it('removes the widget and its listener on unmount', () => {
    const { unmount } = renderPanel();
    unmount();
    expect(widgetScript()).toBeNull();
  });
});
