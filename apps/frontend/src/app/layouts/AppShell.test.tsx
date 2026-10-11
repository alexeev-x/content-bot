import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider
} from '@tanstack/react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readAppEnvironment, showEnvironmentBadge } from '../environment';
import { AppShell } from './AppShell';

function renderShell(
  props: {
    incidentsCount?: number;
    onLogout?: () => void;
    ownerName?: string;
    topBarTools?: ReactNode;
    focused?: boolean;
  } = {},
  path = '/'
) {
  const root = createRootRoute({
    component: () => (
      <AppShell {...props}>
        <h1>Страница</h1>
      </AppShell>
    )
  });
  const index = createRoute({ getParentRoute: () => root, path: '/' });
  const editor = createRoute({ getParentRoute: () => root, path: '/posts/$id' });
  const router = createRouter({
    routeTree: root.addChildren([index, editor]),
    history: createMemoryHistory({ initialEntries: [path] })
  });
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset['theme'];
});
afterEach(cleanup);

describe('AppShell', () => {
  it('has a skip link, a main landmark and the primary navigation in Russian', async () => {
    renderShell();
    expect(await screen.findByRole('main')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Перейти к содержимому' })).toBeTruthy();
    const nav = screen.getAllByRole('navigation', { name: 'Основная навигация' })[0]!;
    for (const label of ['Обзор', 'Посты', 'Публикации', 'Источники', 'Настройки']) {
      expect(within(nav).getByRole('link', { name: new RegExp(label) })).toBeTruthy();
    }
    // Sections that are still «Раздел в разработке» stubs are not offered (their routes stay).
    for (const label of ['Календарь', 'Автоматизации', 'Медиа']) {
      expect(within(nav).queryByRole('link', { name: new RegExp(label) })).toBeNull();
    }
    expect(within(nav).getByRole('link', { name: /Обзор/ }).getAttribute('aria-current')).toBe('page');
  });

  it('lists the sidebar items in order with no group headings', async () => {
    renderShell();
    await screen.findByRole('main');
    expect(screen.queryByRole('group')).toBeNull();
    for (const heading of ['Работа', 'Аналитика', 'Система']) expect(screen.queryByText(heading)).toBeNull();
    const side = document.querySelector('aside');
    const names = [...(side?.querySelectorAll('nav a') ?? [])].map((link) => link.textContent);
    expect(names).toEqual(['Обзор', 'Посты', 'Публикации', 'Инциденты', 'Источники', 'Настройки']);
  });

  it('collapses the sidebar to icons, keeps link names and remembers the choice', async () => {
    const user = userEvent.setup();
    const { unmount } = renderShell();
    await user.click(await screen.findByRole('button', { name: 'Свернуть меню' }));
    expect(document.querySelector('[data-sidebar="collapsed"]')).not.toBeNull();
    expect(window.localStorage.getItem('ui-sidebar-collapsed')).toBe('1');
    expect(screen.getAllByRole('link', { name: /Посты/ }).length).toBeGreaterThan(0);
    unmount();
    renderShell();
    expect(await screen.findByRole('button', { name: 'Развернуть меню' })).toBeTruthy();
  });

  it('renders the top bar tools slot', async () => {
    renderShell({ topBarTools: <button type="button">Тема</button> });
    expect(await screen.findByRole('button', { name: 'Тема' })).toBeTruthy();
  });

  it('skip link moves focus to main', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(await screen.findByRole('link', { name: 'Перейти к содержимому' }));
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('shows the open incidents count on the incidents item, capped at 99+, and hides it at 0', async () => {
    renderShell({ incidentsCount: 3 });
    await screen.findByRole('main');
    expect(screen.getAllByText('3 требуют внимания').length).toBeGreaterThan(0);
    cleanup();
    renderShell({ incidentsCount: 99 });
    await screen.findByRole('main');
    expect(screen.getAllByText('99+ требуют внимания').length).toBeGreaterThan(0);
    cleanup();
    renderShell({ incidentsCount: 0 });
    await screen.findByRole('main');
    expect(screen.queryByText(/требуют внимания/)).toBeNull();
  });

  it('names the owner once: in the top-bar menu, not again in the sidebar', async () => {
    renderShell({ ownerName: 'Алекс' });
    await screen.findByRole('main');
    expect(screen.queryByText('Владелец')).toBeNull();
    expect(document.querySelector('aside')?.textContent).not.toContain('Алекс');
  });

  it('marks the shell while the post editor is open so phones show one bottom layer', async () => {
    renderShell({}, '/posts/abc');
    await screen.findByRole('main');
    expect(document.querySelector('[data-editor]')).not.toBeNull();
    cleanup();
    renderShell();
    await screen.findByRole('main');
    expect(document.querySelector('[data-editor]')).toBeNull();
  });

  it('hides the top bar on editor routes and keeps the owner menu in the page header tools', async () => {
    renderShell({ ownerName: 'Алекс' }, '/posts/abc');
    await screen.findByRole('main');
    expect(document.querySelector('header')).toBeNull();
    cleanup();
    renderShell({ ownerName: 'Алекс', focused: true });
    await screen.findByRole('main');
    expect(document.querySelector('header')).toBeNull();
    cleanup();
    renderShell({ ownerName: 'Алекс' });
    await screen.findByRole('main');
    expect(document.querySelector('header')).not.toBeNull();
  });

  it('shows the DEV badge outside production', async () => {
    renderShell();
    await screen.findByRole('main');
    expect(showEnvironmentBadge(readAppEnvironment())).toBe(true);
    expect(screen.getAllByText('DEV').length).toBeGreaterThan(0);
  });

  it('opens the owner menu with the keyboard and signs out from it', async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    renderShell({ onLogout, ownerName: 'Алекс' });
    const trigger = (await screen.findAllByRole('button', { name: 'Меню владельца: Алекс' }))[0]!;
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Выйти']);
    await user.click(screen.getByRole('menuitem', { name: 'Выйти' }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('opens the «Ещё» sheet with the remaining sections', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(await screen.findByRole('button', { name: 'Ещё' }));
    const sheet = screen.getByRole('dialog', { name: 'Разделы' });
    expect(within(sheet).getByRole('link', { name: /Настройки/ })).toBeTruthy();
    expect(within(sheet).queryByRole('link', { name: /Обзор/ })).toBeNull();
  });
});

describe('environment', () => {
  it('treats anything but production as non-production', () => {
    expect(showEnvironmentBadge('production')).toBe(false);
    expect(showEnvironmentBadge('dev')).toBe(true);
    expect(showEnvironmentBadge('local')).toBe(true);
  });

  it('keeps the top bar in a browser and drops it inside the Mini App', async () => {
    renderShell();
    expect(await screen.findByRole('main')).toBeTruthy();
    expect(document.querySelector('header')).not.toBeNull();
    cleanup();
    (window as unknown as { Telegram: unknown }).Telegram = { WebApp: { initData: 'query_id=1&hash=x' } };
    try {
      renderShell();
      expect(await screen.findByRole('main')).toBeTruthy();
      expect(document.querySelector('header')).toBeNull();
    } finally {
      delete (window as unknown as { Telegram?: unknown }).Telegram;
    }
  });
});
