import type { CustomPresetDto } from '@alexeev/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyAppearance,
  applyCachedAppearance,
  DEFAULT_APPEARANCE,
  readCachedAppearance,
  type Appearance
} from './theme';

const telegram = vi.hoisted(() => ({ scheme: undefined as 'light' | 'dark' | undefined }));
vi.mock('../shared/telegram/web-app', () => ({
  getTelegramColorScheme: () => telegram.scheme,
  subscribeThemeChanged: () => () => {}
}));

const root = document.documentElement;
const custom: CustomPresetDto = { id: '5b3f4d1e-8a52-4f0e-9f7b-0a1b2c3d4e5f', name: 'Teal', baseColor: '#0f9d8a' };
const withCustom: Appearance = {
  themeMode: 'dark',
  lightAccent: { kind: 'custom', id: custom.id },
  darkAccent: { kind: 'preset', id: 'copper' },
  customPresets: [custom]
};

function mockMatchMedia(light: boolean) {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: light, addEventListener: vi.fn(), removeEventListener: vi.fn() });
}

beforeEach(() => {
  window.localStorage.clear();
  telegram.scheme = undefined;
  mockMatchMedia(false);
  for (const attr of ['theme', 'accentLight', 'accentDark']) delete root.dataset[attr];
  root.removeAttribute('style');
  vi.restoreAllMocks();
});

describe('applyAppearance', () => {
  it('applies preset accents for both themes', () => {
    applyAppearance({ ...DEFAULT_APPEARANCE, themeMode: 'light', darkAccent: { kind: 'preset', id: 'orchid' } });
    expect(root.dataset['theme']).toBe('light');
    expect(root.dataset['accentLight']).toBe('cobalt');
    expect(root.dataset['accentDark']).toBe('orchid');
    expect(root.style.getPropertyValue('--custom-light-accent')).toBe('');
  });

  it('injects derived custom properties and marks the accent custom', () => {
    applyAppearance(withCustom);
    expect(root.dataset['accentLight']).toBe('custom');
    expect(root.style.getPropertyValue('--custom-light-accent')).toMatch(/^#[0-9a-f]{6}$/);
    expect(root.style.getPropertyValue('--custom-light-on-accent')).toBe('#ffffff');
    expect(root.style.getPropertyValue('--custom-light-accent-soft')).toMatch(/^rgba\(/);
    expect(root.dataset['accentDark']).toBe('copper');
    expect(root.style.getPropertyValue('--custom-dark-accent')).toBe('');
  });

  it('removes injected properties when the accent switches back to a preset', () => {
    applyAppearance(withCustom);
    applyAppearance({ ...withCustom, lightAccent: { kind: 'preset', id: 'indigo' } });
    expect(root.dataset['accentLight']).toBe('indigo');
    expect(root.style.getPropertyValue('--custom-light-accent')).toBe('');
  });

  it('falls back to cobalt for a custom reference without a preset', () => {
    applyAppearance({ ...withCustom, customPresets: [] });
    expect(root.dataset['accentLight']).toBe('cobalt');
  });

  it('resolves system mode from Telegram first, then prefers-color-scheme', () => {
    telegram.scheme = 'light';
    mockMatchMedia(false);
    applyAppearance(DEFAULT_APPEARANCE);
    expect(root.dataset['theme']).toBe('light');
    telegram.scheme = undefined;
    mockMatchMedia(true);
    applyAppearance(DEFAULT_APPEARANCE);
    expect(root.dataset['theme']).toBe('light');
    mockMatchMedia(false);
    applyAppearance(DEFAULT_APPEARANCE);
    expect(root.dataset['theme']).toBe('dark');
  });

  it('an explicit mode ignores Telegram and the system', () => {
    telegram.scheme = 'light';
    applyAppearance({ ...DEFAULT_APPEARANCE, themeMode: 'dark' });
    expect(root.dataset['theme']).toBe('dark');
  });
});

describe('appearance cache', () => {
  it('defaults to cobalt and system with an empty cache', () => {
    expect(readCachedAppearance()).toEqual(DEFAULT_APPEARANCE);
    applyCachedAppearance();
    expect(root.dataset['accentLight']).toBe('cobalt');
    expect(root.dataset['accentDark']).toBe('cobalt');
  });

  it('round-trips the last applied appearance and replays it', () => {
    applyAppearance(withCustom);
    expect(readCachedAppearance()).toEqual(withCustom);
    for (const attr of ['theme', 'accentLight', 'accentDark']) delete root.dataset[attr];
    root.removeAttribute('style');
    applyCachedAppearance();
    expect(root.dataset['theme']).toBe('dark');
    expect(root.dataset['accentLight']).toBe('custom');
    expect(root.style.getPropertyValue('--custom-light-accent')).toMatch(/^#/);
  });

  it('does not write the cache when replaying it', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    applyCachedAppearance();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('ignores a corrupt or invalid cache', () => {
    window.localStorage.setItem('ui-appearance', '{not json');
    expect(readCachedAppearance()).toEqual(DEFAULT_APPEARANCE);
    window.localStorage.setItem('ui-appearance', JSON.stringify({ lightAccent: { kind: 'preset', id: 'lime' } }));
    expect(readCachedAppearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it('survives blocked storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => applyAppearance(withCustom)).not.toThrow();
    expect(readCachedAppearance()).toEqual(DEFAULT_APPEARANCE);
    expect(root.dataset['accentLight']).toBe('custom');
  });
});
