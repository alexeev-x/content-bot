import type { ThemeMode } from '@alexeev/contracts';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { ACCENT_IDS, DEFAULT_ACCENT, isAccentId, type AccentId } from '../shared/lib/color';
import { getTelegramColorScheme, subscribeThemeChanged } from '../shared/telegram/web-app';

export type ThemePreference = ThemeMode;
export type ResolvedTheme = 'light' | 'dark';

/** The owner's appearance as the server stores it, reduced to one accent for both themes. */
export type Appearance = {
  themeMode: ThemeMode;
  accent: AccentId;
};

const DEFAULT_APPEARANCE: Appearance = { themeMode: 'system', accent: DEFAULT_ACCENT };

export type Density = 'normal' | 'compact';
const DENSITY_KEY = 'ui-density'; // per device, never sent to the server

/** Fired on `window` after a persisted applyAppearance, so useTheme re-reads the stored mode. */
const APPEARANCE_APPLIED_EVENT = 'appearance-applied';

const STORAGE_KEY = 'ui-theme'; // UI preference only, never a token
const APPEARANCE_KEY = 'ui-appearance'; // last applied accents: a flash-avoiding cache, the server is the truth

function readPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    // storage unavailable
  }
  return 'system';
}

function writePreference(value: ThemePreference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // storage unavailable: preference lasts for this session only
  }
}

function readSystemScheme(): ResolvedTheme {
  const telegram = getTelegramColorScheme();
  if (telegram) return telegram;
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return 'dark';
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? readSystemScheme() : preference;
}

function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset['theme'] = theme;
}

const cachedAppearanceSchema = z.object({ accent: z.string().refine(isAccentId) });

/** Last applied appearance from localStorage; the defaults when absent, corrupt (or from the old format) or blocked. */
function readCachedAppearance(): Appearance {
  const themeMode = readPreference();
  try {
    const raw = window.localStorage.getItem(APPEARANCE_KEY);
    if (raw) {
      const parsed = cachedAppearanceSchema.safeParse(JSON.parse(raw));
      if (parsed.success && isAccentId(parsed.data.accent)) return { themeMode, accent: parsed.data.accent };
    }
  } catch {
    // storage unavailable or invalid JSON
  }
  return { ...DEFAULT_APPEARANCE, themeMode };
}

function writeCachedAppearance(appearance: Appearance): void {
  try {
    window.localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ accent: appearance.accent }));
  } catch {
    // storage unavailable: the cache only avoids a flash on the next load
  }
}

export function readDensity(): Density {
  try {
    return window.localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'normal';
  } catch {
    return 'normal';
  }
}

/** Sets data-density on <html> and remembers it on this device; touch and narrow screens ignore it in CSS. */
export function applyDensity(density: Density, options: { persist?: boolean } = {}): void {
  const root = document.documentElement;
  if (density === 'compact') root.dataset['density'] = 'compact';
  else delete root.dataset['density'];
  if (options.persist ?? true) {
    try {
      window.localStorage.setItem(DENSITY_KEY, density);
    } catch {
      // storage unavailable: the choice lasts for this session only
    }
  }
}

/**
 * Applies theme mode and the accent to <html>. `persist: false` is for the boot call that replays the cache.
 * Fetching and saving the server setting is the caller's job.
 */
export function applyAppearance(appearance: Appearance, options: { persist?: boolean } = {}): void {
  applyTheme(resolveTheme(appearance.themeMode));
  document.documentElement.dataset['accent'] = ACCENT_IDS.includes(appearance.accent)
    ? appearance.accent
    : DEFAULT_ACCENT;
  if (options.persist ?? true) {
    writePreference(appearance.themeMode);
    writeCachedAppearance(appearance);
    window.dispatchEvent(new Event(APPEARANCE_APPLIED_EVENT));
  }
}

/** Boot call, before React renders: replays the cached appearance (defaults: blue, system). */
export function applyCachedAppearance(): void {
  applyAppearance(readCachedAppearance(), { persist: false });
  applyDensity(readDensity(), { persist: false });
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [system, setSystem] = useState<ResolvedTheme>(readSystemScheme);

  useEffect(() => {
    const update = () => setSystem(readSystemScheme());
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null;
    media?.addEventListener('change', update);
    const offTelegram = subscribeThemeChanged(update);
    // The server appearance (applied after sign-in) can change the stored mode behind this hook's back.
    const reread = () => setPreferenceState(readPreference());
    window.addEventListener(APPEARANCE_APPLIED_EVENT, reread);
    return () => {
      media?.removeEventListener('change', update);
      offTelegram();
      window.removeEventListener(APPEARANCE_APPLIED_EVENT, reread);
    };
  }, []);

  const resolved = preference === 'system' ? system : preference;
  useEffect(() => applyTheme(resolved), [resolved]);

  const setPreference = (value: ThemePreference) => {
    writePreference(value);
    setPreferenceState(value);
  };
  return { preference, resolved, setPreference };
}
