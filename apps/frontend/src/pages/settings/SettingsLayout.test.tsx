import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider
} from '@tanstack/react-router';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { routeTree } from '../../routeTree.gen';
import { clearViewport, setViewport } from '../../test/viewport';
import { SettingsIndex } from './SettingsIndex';
import { SettingsLayout } from './SettingsLayout';

afterEach(() => {
  cleanup();
  clearViewport();
});

function renderSettings(initial: string) {
  const root = createRootRoute();
  const settings = createRoute({ getParentRoute: () => root, path: '/settings', component: SettingsLayout });
  const index = createRoute({ getParentRoute: () => settings, path: '/', component: SettingsIndex });
  const channels = createRoute({
    getParentRoute: () => settings,
    path: '/channels',
    component: () => <p>Содержимое каналов</p>
  });
  const appearance = createRoute({
    getParentRoute: () => settings,
    path: '/appearance',
    component: () => <p>Содержимое оформления</p>
  });
  const router = createRouter({
    routeTree: root.addChildren([settings.addChildren([index, channels, appearance])]),
    history: createMemoryHistory({ initialEntries: [initial] })
  });
  render(<RouterProvider router={router} />);
  return { router, user: userEvent.setup() };
}

describe('settings on a phone', () => {
  it('shows the section list at /settings without redirecting', async () => {
    setViewport(375);
    const { router } = renderSettings('/settings');
    const nav = await screen.findByRole('navigation', { name: 'Разделы настроек' });
    expect(within(nav).getByRole('link', { name: 'Каналы' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Оформление' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/settings');
    expect(screen.queryByText('Содержимое каналов')).toBeNull();
  });

  it('opens a section with a back link and returns to the list with focus on the opened row', async () => {
    setViewport(375);
    const { user } = renderSettings('/settings');
    await user.click(await screen.findByRole('link', { name: 'Оформление' }));
    expect(await screen.findByText('Содержимое оформления')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Разделы настроек' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Оформление' })).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'Настройки' }));
    const row = await screen.findByRole('link', { name: 'Оформление' });
    await waitFor(() => expect(document.activeElement).toBe(row));
    expect(screen.queryByText('Содержимое оформления')).toBeNull();
  });

  it('opens a deep link straight on the detail', async () => {
    setViewport(375);
    renderSettings('/settings/channels');
    expect(await screen.findByText('Содержимое каналов')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Настройки' })).toBeTruthy();
  });
});

describe('settings on a wide screen', () => {
  it('redirects /settings to the first section and shows the list beside the detail', async () => {
    setViewport(1280);
    const { router } = renderSettings('/settings');
    expect(await screen.findByText('Содержимое каналов')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/settings/channels');
    const nav = screen.getByRole('navigation', { name: 'Разделы настроек' });
    expect(within(nav).getByRole('link', { name: 'Каналы' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('heading', { level: 2, name: 'Каналы' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Настройки' })).toBeNull();
  });

  it('switches sections from the list and keeps the list', async () => {
    setViewport(1280);
    const { user } = renderSettings('/settings/channels');
    await user.click(await screen.findByRole('link', { name: 'Оформление' }));
    expect(await screen.findByText('Содержимое оформления')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Разделы настроек' })).toBeTruthy();
  });
});

describe('settings routes', () => {
  it('has no /settings/bot route', () => {
    const settings = routeTree.children?.['SettingsRoute' as never] as unknown;
    expect(JSON.stringify(Object.keys((settings as { children?: object })?.children ?? {}))).not.toContain('Bot');
    expect(Object.keys(routeTree.children ?? {})).not.toContain('SettingsBotRoute');
  });
});
