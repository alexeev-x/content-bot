import { useEffect, useState } from 'react';
import { getTelegramColorScheme, subscribeThemeChanged } from '../shared/telegram/web-app';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'ui-theme'; // UI preference only, never a token

export function readPreference(): ThemePreference {
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

export function readSystemScheme(): ResolvedTheme {
  const telegram = getTelegramColorScheme();
  if (telegram) return telegram;
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return 'dark';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? readSystemScheme() : preference;
}

export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset['theme'] = theme;
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [system, setSystem] = useState<ResolvedTheme>(readSystemScheme);

  useEffect(() => {
    const update = () => setSystem(readSystemScheme());
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null;
    media?.addEventListener('change', update);
    const offTelegram = subscribeThemeChanged(update);
    return () => {
      media?.removeEventListener('change', update);
      offTelegram();
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
