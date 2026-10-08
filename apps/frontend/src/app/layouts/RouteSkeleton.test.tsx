import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage } from '../../test/render-app';
import { clearViewport, setViewport } from '../../test/viewport';
import { RouteSkeleton } from './RouteSkeleton';

afterEach(() => {
  cleanup();
  clearViewport();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('RouteSkeleton', () => {
  it.each([
    ['/posts', 'Посты', 'Список постов'],
    ['/publications', 'Публикации', 'Список публикаций']
  ])('draws the loaded geometry of %s without any data', (pathname, title, label) => {
    render(<RouteSkeleton pathname={pathname} title={title} />);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Все' })).toBeTruthy();
    expect(screen.getByRole('grid', { name: label }).closest('[aria-busy="true"]')).toBeTruthy();
  });

  it('draws the incidents tabs and panel without any data', () => {
    render(<RouteSkeleton pathname="/incidents" title="Инциденты" />);
    expect(screen.getByRole('tab', { name: 'Открытые' })).toBeTruthy();
    expect(screen.getByText('Открытые инциденты')).toBeTruthy();
  });

  it('draws the settings skeleton for a section path', () => {
    render(<RouteSkeleton pathname="/settings/channels" title="Настройки" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Настройки' })).toBeTruthy();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('draws the phone rows on a narrow screen', () => {
    setViewport(375);
    render(<RouteSkeleton pathname="/posts" title="Посты" />);
    expect(screen.getByRole('list', { name: 'Список постов' })).toBeTruthy();
    expect(screen.queryByRole('grid')).toBeNull();
  });

  it('draws the cached Обзор layout, or the default without one, and asks the network for nothing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await renderPage(<RouteSkeleton pathname="/" title="Обзор" />);
    expect(document.querySelector('[data-widget="kpi-summary"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-widget]')).toHaveLength(9);
    cleanup();

    const saved = { revision: 2, widgets: [{ id: 'today', type: 'today', x: 4, y: 0, w: 8, h: 4 }] };
    window.localStorage.setItem('ui-dashboard-layout', JSON.stringify(saved));
    await renderPage(<RouteSkeleton pathname="/" title="Обзор" />);
    const widgets = [...document.querySelectorAll<HTMLElement>('[data-widget]')];
    expect(widgets.map((item) => item.dataset['widget'])).toEqual(['today']);
    expect([widgets[0]?.style.gridColumn, widgets[0]?.style.gridRow]).toEqual(['5 / span 8', '1 / span 4']);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
