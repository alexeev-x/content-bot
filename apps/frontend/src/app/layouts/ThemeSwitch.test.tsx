import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeSwitch } from './ThemeSwitch';

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset['theme'];
});

describe('ThemeSwitch', () => {
  it('switches theme with the keyboard and stores the preference', async () => {
    const user = userEvent.setup();
    render(<ThemeSwitch />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Системная' }));
    await user.keyboard('{ArrowLeft}');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(window.localStorage.getItem('ui-theme')).toBe('dark');
    await user.keyboard('{ArrowLeft}');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(screen.getByRole('radio', { name: 'Светлая' })).toHaveProperty('checked', true);
  });
});
