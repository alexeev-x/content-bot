import { QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider
} from '@tanstack/react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { LoginPage } from '../../pages/LoginPage';
import { clearSession, getAccessToken } from '../../shared/api/session';
import { errorBody } from '../../test/fixtures';
import { server, setupMswServer } from '../../test/msw';
import { createTestQueryClient } from '../../test/query-wrapper';
import { AppLayout } from '../layouts/AppLayout';
import { AuthProvider } from './AuthProvider';

setupMswServer();

function renderApp(initial: string) {
  const client = createTestQueryClient();
  const root = createRootRoute({ component: AppLayout });
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => <h1>Страница обзора</h1> });
  const posts = createRoute({ getParentRoute: () => root, path: '/posts', component: () => <h1>Страница постов</h1> });
  const login = createRoute({
    getParentRoute: () => root,
    path: '/login',
    validateSearch: z.object({ redirect: z.string().optional().catch(undefined) }),
    component: function LoginRoute() {
      return <LoginPage redirect={login.useSearch().redirect} />;
    }
  });
  const router = createRouter({
    routeTree: root.addChildren([index, posts, login]),
    history: createMemoryHistory({ initialEntries: [initial] })
  });
  const view = render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
  return { ...view, router, client };
}

const setInitData = (initData: string) => {
  (window as unknown as { Telegram: unknown }).Telegram = {
    WebApp: {
      initData,
      colorScheme: 'dark',
      ready: () => undefined,
      expand: () => undefined,
      onEvent: () => undefined,
      offEvent: () => undefined
    }
  };
};

const getAppearance = (overrides: Record<string, unknown> = {}) =>
  http.get('*/api/v1/settings/appearance', () =>
    HttpResponse.json({
      themeMode: 'system',
      lightAccent: { kind: 'preset', id: 'cobalt' },
      darkAccent: { kind: 'preset', id: 'cobalt' },
      customPresets: [],
      revision: 0,
      updatedAt: null,
      ...overrides
    })
  );

const failing = (path: string, status: number, code: Parameters<typeof errorBody>[0]) =>
  http.post(`*${path}`, () => HttpResponse.json(errorBody(code), { status }));

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  vi.stubGlobal('__TELEGRAM_BOT_USERNAME__', 'test_bot');
  server.use(getAppearance());
});
afterEach(() => {
  cleanup();
  clearSession();
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  vi.unstubAllGlobals();
  delete document.documentElement.dataset['accentLight'];
});

describe('auth guard', () => {
  it('sends an anonymous browser to /login and keeps where it was going', async () => {
    server.use(failing('/api/v1/auth/refresh', 401, 'UNAUTHORIZED'));
    const { router } = renderApp('/posts');
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toEqual({ redirect: '/posts' });
    expect(screen.queryByText('Страница постов')).toBeNull();
  });

  it('reports the session check on /login inside the sign-in card, not as a full-screen loader', async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.post('*/api/v1/auth/refresh', async () => {
        await held;
        return HttpResponse.json(errorBody('UNAUTHORIZED'), { status: 401 });
      })
    );
    renderApp('/login');
    try {
      expect(await screen.findByRole('heading', { name: 'Вход' })).toBeTruthy();
      expect(screen.getByRole('status').textContent).toBe('Проверяем вход…');
      expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    } finally {
      // Settle the check so no request outlives the test.
      release();
    }
    expect(await screen.findByText('Загружаем кнопку входа через Telegram…')).toBeTruthy();
  });

  it('restores a browser session with exactly one refresh call and shows the owner name and server appearance', async () => {
    let refreshes = 0;
    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        refreshes += 1;
        return HttpResponse.json({ accessToken: 'restored', expiresAt: '2099-01-01T00:00:00.000Z' });
      }),
      getAppearance({ revision: 1, lightAccent: { kind: 'preset', id: 'indigo' } })
    );
    renderApp('/posts');
    expect(await screen.findByRole('heading', { name: 'Страница постов' })).toBeTruthy();
    expect(refreshes).toBe(1);
    expect(getAccessToken()).toBe('restored');
    expect((await screen.findAllByText('Owner')).length).toBeGreaterThan(0);
    await waitFor(() => expect(document.documentElement.dataset['accentLight']).toBe('indigo'));
    expect(document.title).toContain('ALEXEEV Studio');
  });

  it('signs in automatically inside Telegram without touching the refresh cookie route', async () => {
    setInitData('query_id=1&hash=abc');
    let signIns = 0;
    let refreshes = 0;
    server.use(
      http.post('*/api/v1/auth/telegram', () => {
        signIns += 1;
        return HttpResponse.json({ accessToken: 'mini', expiresAt: '2099-01-01T00:00:00.000Z' });
      }),
      http.post('*/api/v1/auth/refresh', () => {
        refreshes += 1;
        return HttpResponse.json(errorBody('UNAUTHORIZED'), { status: 401 });
      })
    );
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Страница обзора' })).toBeTruthy();
    expect(signIns).toBe(1);
    expect(refreshes).toBe(0);
  });

  it('explains an expired Mini App launch on the login page and lets the operator retry', async () => {
    setInitData('query_id=1&hash=old');
    server.use(failing('/api/v1/auth/telegram', 401, 'UNAUTHORIZED'));
    const user = userEvent.setup();
    renderApp('/posts');
    expect(await screen.findByText('Сессия Telegram устарела')).toBeTruthy();
    expect(document.querySelector('script[data-telegram-login]')).toBeNull();
    server.use(
      http.post('*/api/v1/auth/telegram', () =>
        HttpResponse.json({ accessToken: 'mini2', expiresAt: '2099-01-01T00:00:00.000Z' })
      )
    );
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('heading', { name: 'Страница постов' })).toBeTruthy();
  });

  it('shows «Нет доступа» when the account is not the owner, with no data', async () => {
    server.use(failing('/api/v1/auth/refresh', 403, 'FORBIDDEN'));
    renderApp('/posts');
    expect(await screen.findByRole('heading', { name: 'Нет доступа' })).toBeTruthy();
    expect(screen.queryByText('Страница постов')).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it('keeps the operator out of data and offers a retry when the session cannot be checked', async () => {
    server.use(failing('/api/v1/auth/refresh', 503, 'UNAVAILABLE'));
    renderApp('/posts');
    expect(await screen.findByText('Не удалось проверить вход')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy();
  });

  it('leaves /login for the requested page once signed in, and ignores a foreign redirect', async () => {
    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'r', expiresAt: '2099-01-01T00:00:00.000Z' })
      )
    );
    const first = renderApp('/login?redirect=%2Fposts');
    expect(await screen.findByRole('heading', { name: 'Страница постов' })).toBeTruthy();
    first.unmount();
    clearSession();
    renderApp('/login?redirect=%2F%2Fevil.example');
    expect(await screen.findByRole('heading', { name: 'Страница обзора' })).toBeTruthy();
  });
});

describe('logout', () => {
  const signedIn = () =>
    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'live', expiresAt: '2099-01-01T00:00:00.000Z' })
      )
    );

  async function logOut(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole('heading', { name: 'Страница постов' });
    const trigger = (await screen.findAllByRole('button', { name: /Меню владельца/ }))[0]!;
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'Выйти' }));
  }

  it('revokes on the server, clears the session and the query cache, and returns to the login page', async () => {
    signedIn();
    let revoked = 0;
    server.use(
      http.post('*/api/v1/auth/logout', () => {
        revoked += 1;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();
    const { router, client } = renderApp('/posts');
    await screen.findByRole('heading', { name: 'Страница постов' });
    await waitFor(() => expect(client.getQueryData(['auth', 'me'])).toBeDefined());
    await logOut(user);
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeTruthy();
    expect(revoked).toBe(1);
    expect(getAccessToken()).toBeNull();
    expect(client.getQueryData(['auth', 'me'])).toBeUndefined();
    expect(router.state.location.search).toEqual({});
    expect(screen.queryByText(/Вы вышли на этом устройстве/)).toBeNull();
  });

  it('still signs out locally and says so when the server did not confirm', async () => {
    signedIn();
    server.use(failing('/api/v1/auth/logout', 503, 'UNAVAILABLE'));
    const user = userEvent.setup();
    renderApp('/posts');
    await logOut(user);
    expect(await screen.findByText('Сервер не подтвердил выход')).toBeTruthy();
    expect(getAccessToken()).toBeNull();
  });
});
