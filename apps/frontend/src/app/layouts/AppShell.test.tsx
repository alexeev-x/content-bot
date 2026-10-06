import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider
} from '@tanstack/react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readAppEnvironment, showEnvironmentBadge } from '../environment';
import { AppShell } from './AppShell';

function renderShell(props: { incidentsCount?: number; onLogout?: () => void; ownerName?: string } = {}) {
  const root = createRootRoute({
    component: () => (
      <AppShell {...props}>
        <h1>Страница</h1>
      </AppShell>
    )
  });
  const index = createRoute({ getParentRoute: () => root, path: '/' });
  const router = createRouter({
    routeTree: root.addChildren([index]),
    history: createMemoryHistory({ initialEntries: ['/'] })
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
    for (const label of [
      'Главная',
      'Посты',
      'Публикации',
      'Календарь',
      'Автоматизации',
      'Медиа',
      'Инциденты',
      'Настройки'
    ]) {
      expect(within(nav).getByRole('link', { name: new RegExp(label) })).toBeTruthy();
    }
    expect(
      within(nav)
        .getByRole('link', { name: /Главная/ })
        .getAttribute('aria-current')
    ).toBe('page');
  });

  it('skip link moves focus to main', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(await screen.findByRole('link', { name: 'Перейти к содержимому' }));
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('shows the incidents count with a text alternative only when there are incidents', async () => {
    const { unmount } = renderShell();
    await screen.findByRole('main');
    expect(screen.queryByText('Открытых инцидентов: 3')).toBeNull();
    unmount();
    renderShell({ incidentsCount: 3 });
    expect((await screen.findAllByText('Открытых инцидентов: 3')).length).toBeGreaterThan(0);
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
    expect(screen.getByRole('menuitem', { name: 'Оформление' })).toBeTruthy();
    await user.click(screen.getByRole('menuitem', { name: 'Выйти' }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('opens the «Ещё» sheet with the remaining sections', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(await screen.findByRole('button', { name: 'Ещё' }));
    const sheet = screen.getByRole('dialog', { name: 'Разделы' });
    expect(within(sheet).getByRole('link', { name: /Настройки/ })).toBeTruthy();
    expect(within(sheet).queryByRole('link', { name: /Главная/ })).toBeNull();
  });
});

describe('environment', () => {
  it('treats anything but production as non-production', () => {
    expect(showEnvironmentBadge('production')).toBe(false);
    expect(showEnvironmentBadge('dev')).toBe(true);
    expect(showEnvironmentBadge('local')).toBe(true);
  });
});
