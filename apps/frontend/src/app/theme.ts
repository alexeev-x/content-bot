import {
  accentRefSchema,
  customPresetSchema,
  CUSTOM_PRESETS_MAX,
  type AccentRef,
  type CustomPresetDto,
  type ThemeMode
} from '@alexeev/contracts';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { deriveAccent, type ColorTheme, type DerivedAccent } from '../shared/lib/color';
import { getTelegramColorScheme, subscribeThemeChanged } from '../shared/telegram/web-app';

export type ThemePreference = ThemeMode;
export type ResolvedTheme = ColorTheme;

/** The owner's appearance setting as the server stores it (AppearanceDto without revision). */
export type Appearance = {
  themeMode: ThemeMode;
  lightAccent: AccentRef;
  darkAccent: AccentRef;
  customPresets: readonly CustomPresetDto[];
};

const DEFAULT_APPEARANCE: Appearance = {
  themeMode: 'system',
  lightAccent: { kind: 'preset', id: 'cobalt' },
  darkAccent: { kind: 'preset', id: 'cobalt' },
  customPresets: []
};

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
  lightAccent: accentRefSchema,
  darkAccent: accentRefSchema,
  customPresets: z.array(customPresetSchema).max(CUSTOM_PRESETS_MAX)
});

/** Last applied appearance from localStorage; the defaults when absent, corrupt or storage is blocked. */
function readCachedAppearance(): Appearance {
  const themeMode = readPreference();
  try {
    const raw = window.localStorage.getItem(APPEARANCE_KEY);
    if (raw) {
      const parsed = cachedAppearanceSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return { themeMode, ...parsed.data };
    }
  } catch {
    // storage unavailable or invalid JSON
  }
  return { ...DEFAULT_APPEARANCE, themeMode };
}

function writeCachedAppearance(appearance: Appearance): void {
  try {
    const { lightAccent, darkAccent, customPresets } = appearance;
    window.localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ lightAccent, darkAccent, customPresets }));
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

/** Sets data-accent-<theme> and, for a custom preset, the --custom-<theme>-* properties tokens.css reads. */
function applyAccent(theme: ResolvedTheme, ref: AccentRef, customPresets: readonly CustomPresetDto[]): void {
  const root = document.documentElement;
  const custom = ref.kind === 'custom' ? customPresets.find((preset) => preset.id === ref.id) : undefined;
  for (const suffix of Object.values(TOKEN_SUFFIXES)) root.style.removeProperty(`--custom-${theme}-${suffix}`);
  if (custom) {
    const derived = deriveAccent(custom.baseColor, theme);
    for (const [key, suffix] of Object.entries(TOKEN_SUFFIXES)) {
      root.style.setProperty(`--custom-${theme}-${suffix}`, derived[key as keyof DerivedAccent]);
    }
    root.dataset[theme === 'light' ? 'accentLight' : 'accentDark'] = 'custom';
    return;
  }
  // A dangling custom reference (preset deleted elsewhere) falls back to the default.
  root.dataset[theme === 'light' ? 'accentLight' : 'accentDark'] = ref.kind === 'preset' ? ref.id : 'cobalt';
}

/**
 * Applies theme mode and both accents to <html>. `persist: false` is for the boot call that replays the cache.
 * Fetching and saving the server setting is the caller's job.
 */
export function applyAppearance(appearance: Appearance, options: { persist?: boolean } = {}): void {
  applyTheme(resolveTheme(appearance.themeMode));
  applyAccent('light', appearance.lightAccent, appearance.customPresets);
  applyAccent('dark', appearance.darkAccent, appearance.customPresets);
  if (options.persist ?? true) {
    writePreference(appearance.themeMode);
    writeCachedAppearance(appearance);
    window.dispatchEvent(new Event(APPEARANCE_APPLIED_EVENT));
  }
}

/** Boot call, before React renders: replays the cached appearance (defaults: cobalt, system). */
export function applyCachedAppearance(): void {
  applyAppearance(readCachedAppearance(), { persist: false });
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
