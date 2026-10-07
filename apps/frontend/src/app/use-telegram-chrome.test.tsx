import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider
} from '@tanstack/react-router';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTelegramChrome } from './use-telegram-chrome';
import type { ResolvedTheme } from './theme';

function installTelegram() {
  const webApp = {
    initData: 'query_id=1&hash=x',
    colorScheme: 'light',
    isVersionAtLeast: () => true,
    BackButton: { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() },
    disableVerticalSwipes: vi.fn(),
    setHeaderColor: vi.fn(),
    setBackgroundColor: vi.fn(),
    setBottomBarColor: vi.fn(),
    onEvent: vi.fn(),
    offEvent: vi.fn()
  };
  (window as unknown as { Telegram: unknown }).Telegram = { WebApp: webApp };
  return webApp;
}

function Chrome({
  initial,
  expose
}: {
  initial: ResolvedTheme;
  expose: (set: (theme: ResolvedTheme) => void) => void;
}) {
  const [theme, setTheme] = useState(initial);
  useEffect(() => expose(setTheme), [expose]);
  useTelegramChrome(theme);
  return <Outlet />;
}

function setup(initialPath: string, theme: ResolvedTheme = 'light', entries?: string[]) {
  let setCurrent: (theme: ResolvedTheme) => void = () => {};
  const expose = (set: (theme: ResolvedTheme) => void) => {
    setCurrent = set;
  };
  const root = createRootRoute({ component: () => <Chrome initial={theme} expose={expose} /> });
  const paths = ['/', '/posts', '/posts/new', '/settings', '/settings/channels'];
  const routes = paths.map((path) => createRoute({ getParentRoute: () => root, path }));
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: entries ?? [initialPath], initialIndex: (entries?.length ?? 1) - 1 })
  });
  const view = render(<RouterProvider router={router} />);
  return {
    router,
    setTheme: async (next: ResolvedTheme) => {
      act(() => setCurrent(next));
    },
    unmount: view.unmount
  };
}

beforeEach(() => {
  const style = document.documentElement.style;
  style.setProperty('--color-bg', '#f3f4f6');
  style.setProperty('--color-surface-1', '#ffffff');
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  document.documentElement.removeAttribute('style');
});

describe('useTelegramChrome', () => {
  it('hides the BackButton on a tab root', async () => {
    const webApp = installTelegram();
    setup('/posts');
    await waitFor(() => expect(webApp.disableVerticalSwipes).toHaveBeenCalled());
    expect(webApp.BackButton.show).not.toHaveBeenCalled();
  });

  it('shows the BackButton off the roots and hides it on return', async () => {
    const webApp = installTelegram();
    const { router } = setup('/posts/new');
    await waitFor(() => expect(webApp.BackButton.show).toHaveBeenCalledTimes(1));
    await act(() => router.navigate({ to: '/posts' }));
    await waitFor(() => expect(webApp.BackButton.hide).toHaveBeenCalledTimes(1));
    expect(webApp.BackButton.offClick).toHaveBeenCalledTimes(1);
  });

  it('goes back through history when there is some', async () => {
    const webApp = installTelegram();
    const { router } = setup('/posts/new', 'light', ['/', '/posts/new']);
    await waitFor(() => expect(webApp.BackButton.onClick).toHaveBeenCalled());
    const press = webApp.BackButton.onClick.mock.calls[0]![0] as () => void;
    act(press);
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('goes to the parent route when there is no history', async () => {
    const webApp = installTelegram();
    const { router } = setup('/settings/channels');
    await waitFor(() => expect(webApp.BackButton.onClick).toHaveBeenCalled());
    const press = webApp.BackButton.onClick.mock.calls[0]![0] as () => void;
    act(press);
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'));
  });

  it('sets Telegram colors from the tokens and again when the theme changes', async () => {
    const webApp = installTelegram();
    const { setTheme } = setup('/posts');
    await waitFor(() => expect(webApp.setHeaderColor).toHaveBeenCalledWith('#f3f4f6'));
    expect(webApp.setBackgroundColor).toHaveBeenCalledWith('#f3f4f6');
    expect(webApp.setBottomBarColor).toHaveBeenCalledWith('#ffffff');

    document.documentElement.style.setProperty('--color-bg', '#0d0e10');
    document.documentElement.style.setProperty('--color-surface-1', '#151619');
    await setTheme('dark');
    await waitFor(() => expect(webApp.setHeaderColor).toHaveBeenLastCalledWith('#0d0e10'));
    expect(webApp.setBottomBarColor).toHaveBeenLastCalledWith('#151619');
  });

  it('is a no-op outside Telegram', async () => {
    const { router } = setup('/posts/new');
    await waitFor(() => expect(router.state.location.pathname).toBe('/posts/new'));
  });
});
