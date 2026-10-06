import {
  CUSTOM_PRESETS_MAX,
  type AccentRef,
  type AppearanceDto,
  type CustomPresetDto,
  type ThemeMode
} from '@alexeev/contracts';

/** The editable part of AppearanceDto (everything but revision and updatedAt). */
export type AppearanceValue = {
  themeMode: ThemeMode;
  lightAccent: AccentRef;
  darkAccent: AccentRef;
  customPresets: readonly CustomPresetDto[];
};

export type ThemeName = 'light' | 'dark';

export const FALLBACK_ACCENT: AccentRef = { kind: 'preset', id: 'cobalt' };

export function toValue(dto: AppearanceDto): AppearanceValue {
  return {
    themeMode: dto.themeMode,
    lightAccent: dto.lightAccent,
    darkAccent: dto.darkAccent,
    customPresets: dto.customPresets
  };
}

const sameRef = (a: AccentRef, b: AccentRef) => a.kind === b.kind && a.id === b.id;

export function isSameValue(a: AppearanceValue, b: AppearanceValue): boolean {
  return (
    a.themeMode === b.themeMode &&
    sameRef(a.lightAccent, b.lightAccent) &&
    sameRef(a.darkAccent, b.darkAccent) &&
    a.customPresets.length === b.customPresets.length &&
    a.customPresets.every((preset, index) => {
      const other = b.customPresets[index];
      return (
        other !== undefined &&
        preset.id === other.id &&
        preset.name === other.name &&
        preset.baseColor === other.baseColor
      );
    })
  );
}

export const setThemeMode = (value: AppearanceValue, themeMode: ThemeMode): AppearanceValue => ({
  ...value,
  themeMode
});

export const setAccent = (value: AppearanceValue, theme: ThemeName, accent: AccentRef): AppearanceValue =>
  theme === 'light' ? { ...value, lightAccent: accent } : { ...value, darkAccent: accent };

export const canAddPreset = (value: AppearanceValue) => value.customPresets.length < CUSTOM_PRESETS_MAX;

export function addPreset(value: AppearanceValue, preset: CustomPresetDto): AppearanceValue {
  if (!canAddPreset(value)) return value;
  return { ...value, customPresets: [...value.customPresets, preset] };
}

export const updatePreset = (value: AppearanceValue, preset: CustomPresetDto): AppearanceValue => ({
  ...value,
  customPresets: value.customPresets.map((existing) => (existing.id === preset.id ? preset : existing))
});

/** Themes whose accent is this custom preset. */
export function presetUsage(value: AppearanceValue, id: string): ThemeName[] {
  const themes: ThemeName[] = [];
  if (value.lightAccent.kind === 'custom' && value.lightAccent.id === id) themes.push('light');
  if (value.darkAccent.kind === 'custom' && value.darkAccent.id === id) themes.push('dark');
  return themes;
}

/** A deleted preset in use falls back to cobalt in every theme that used it. */
export function removePreset(value: AppearanceValue, id: string): AppearanceValue {
  const fallback = (ref: AccentRef) => (ref.kind === 'custom' && ref.id === id ? FALLBACK_ACCENT : ref);
  return {
    ...value,
    lightAccent: fallback(value.lightAccent),
    darkAccent: fallback(value.darkAccent),
    customPresets: value.customPresets.filter((preset) => preset.id !== id)
  };
}
