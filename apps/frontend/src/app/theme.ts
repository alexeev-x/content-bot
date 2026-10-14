import type { ThemeMode } from '@alexeev/contracts';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import {
  DEFAULT_ACCENT,
  DEFAULT_CUSTOM_COLOR,
  deriveAccent,
  isAccentChoice,
  parseHex,
  type AccentChoice,
  type ColorTheme,
  type DerivedAccent
} from '../shared/lib/color';
import { getTelegramColorScheme, subscribeThemeChanged } from '../shared/telegram/web-app';

export type ThemePreference = ThemeMode;
export type ResolvedTheme = 'light' | 'dark';

/** The owner's appearance as the server stores it, reduced to one accent for both themes. */
export type Appearance = {
  themeMode: ThemeMode;
  accent: AccentChoice;
  /** The stored custom colour; null when none was saved (the tile then shows the default). */
  customColor?: string | null;
};

const DEFAULT_APPEARANCE: Appearance = { themeMode: 'system', accent: DEFAULT_ACCENT };

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

const cachedAppearanceSchema = z.object({
  accent: z.string().refine(isAccentChoice),
  customColor: z.string().nullable().optional()
});

/** Last applied appearance from localStorage; the defaults when absent, corrupt (or from the old format) or blocked. */
function readCachedAppearance(): Appearance {
  const themeMode = readPreference();
  try {
    const raw = window.localStorage.getItem(APPEARANCE_KEY);
    if (raw) {
      const parsed = cachedAppearanceSchema.safeParse(JSON.parse(raw));
      if (parsed.success && isAccentChoice(parsed.data.accent)) {
        const { accent, customColor } = parsed.data;
        return { themeMode, accent, customColor: customColor && parseHex(customColor) ? customColor : null };
      }
    }
  } catch {
    // storage unavailable or invalid JSON
  }
  return { ...DEFAULT_APPEARANCE, themeMode };
}

function writeCachedAppearance(appearance: Appearance): void {
  try {
    window.localStorage.setItem(
      APPEARANCE_KEY,
      JSON.stringify({ accent: appearance.accent, customColor: appearance.customColor ?? null })
    );
  } catch {
    // storage unavailable: the cache only avoids a flash on the next load
  }
}

const TOKEN_SUFFIXES: Record<keyof DerivedAccent, string> = {
  accent: 'accent',
  hover: 'accent-hover',
  text: 'accent-text',
  soft: 'accent-soft',
  onAccent: 'on-accent',
  ring: 'focus-ring',
  glow: 'accent-glow'
};

/** Injects the --custom-<theme>-* properties tokens.css reads for data-accent="custom". */
function applyCustomColor(baseColor: string): void {
  const root = document.documentElement;
  for (const theme of ['light', 'dark'] as const satisfies readonly ColorTheme[]) {
    const derived = deriveAccent(baseColor, theme);
    for (const [key, suffix] of Object.entries(TOKEN_SUFFIXES)) {
      root.style.setProperty(`--custom-${theme}-${suffix}`, derived[key as keyof DerivedAccent]);
    }
  }
}

/**
 * Applies theme mode and the accent to <html>. `persist: false` is for the boot call that replays the cache.
 * Fetching and saving the server setting is the caller's job.
 */
export function applyAppearance(appearance: Appearance, options: { persist?: boolean } = {}): void {
  applyTheme(resolveTheme(appearance.themeMode));
  // The properties are always set, so the «Свой цвет» tile shows its colour even while another accent is on.
  applyCustomColor(appearance.customColor ?? DEFAULT_CUSTOM_COLOR);
  document.documentElement.dataset['accent'] = isAccentChoice(appearance.accent) ? appearance.accent : DEFAULT_ACCENT;
  if (options.persist ?? true) {
    writePreference(appearance.themeMode);
    writeCachedAppearance(appearance);
    window.dispatchEvent(new Event(APPEARANCE_APPLIED_EVENT));
  }
}

/** Boot call, before React renders: replays the cached appearance (defaults: blue, system). */
export function applyCachedAppearance(): void {
  applyAppearance(readCachedAppearance(), { persist: false });
  // «Плотность» was removed (owner, 14.10.2026): drop a compact choice an older build left on this device.
  delete document.documentElement.dataset['density'];
  try {
    window.localStorage.removeItem('ui-density');
  } catch {
    // storage unavailable: nothing was kept
  }
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
