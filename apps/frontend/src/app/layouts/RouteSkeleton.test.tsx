import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { clearViewport, setViewport } from '../../test/viewport';
import { RouteSkeleton } from './RouteSkeleton';

afterEach(() => {
  cleanup();
  clearViewport();
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
});
