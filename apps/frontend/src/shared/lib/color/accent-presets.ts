import type { AccentRef, CustomPresetDto } from '@alexeev/contracts';

/** The eight accents the owner picks from; tokens.css defines each for light and dark. One accent serves both themes. */
export const ACCENT_IDS = ['blue', 'orange', 'violet', 'teal', 'green', 'pink', 'red', 'graphite'] as const;
export type AccentId = (typeof ACCENT_IDS)[number];
export const DEFAULT_ACCENT: AccentId = 'blue';

/** The six themes the owner picks from (owner, 14.10.2026), in display order; teal and pink stay valid but are not offered. */
export const THEME_PRESET_IDS = [
  'blue',
  'violet',
  'red',
  'orange',
  'green',
  'graphite'
] as const satisfies readonly AccentId[];

export const isAccentId = (value: unknown): value is AccentId =>
  typeof value === 'string' && (ACCENT_IDS as readonly string[]).includes(value);

// Server preset ids: the first five predate the 14.10.2026 palette and keep their meaning under new names.
const SERVER_PRESET = {
  blue: 'cobalt',
  violet: 'indigo',
  orange: 'copper',
  pink: 'orchid',
  graphite: 'mono',
  teal: 'teal',
  green: 'green',
  red: 'red'
} as const satisfies Record<AccentId, string>;
const FROM_SERVER_PRESET = {
  cobalt: 'blue',
  indigo: 'violet',
  copper: 'orange',
  orchid: 'pink',
  mono: 'graphite',
  teal: 'teal',
  green: 'green',
  red: 'red'
} as const satisfies Record<(typeof SERVER_PRESET)[AccentId], AccentId>;

/** The tile «Свой цвет»: one colour for both themes, kept as the single custom preset. */
export type AccentChoice = AccentId | 'custom';
export const isAccentChoice = (value: unknown): value is AccentChoice => value === 'custom' || isAccentId(value);

/** Fixed id: there is only ever one custom preset, so the owner never manages a list. */
export const CUSTOM_ACCENT_ID = '5f0c2a64-9b1e-4c7d-8a3f-2d6e1b7c4a90';
export const CUSTOM_ACCENT_NAME = 'Свой цвет';
export const DEFAULT_CUSTOM_COLOR = '#d9468f';

type Stored = { lightAccent: AccentRef; customPresets: readonly CustomPresetDto[] };

/** Reads the accent choice and the stored custom colour (null when none was ever saved). */
export function accentFromStored({ lightAccent, customPresets }: Stored): {
  accent: AccentChoice;
  customColor: string | null;
} {
  const custom =
    (lightAccent.kind === 'custom' ? customPresets.find((preset) => preset.id === lightAccent.id) : undefined) ??
    customPresets[0];
  const customColor = custom?.baseColor.toLowerCase() ?? null;
  if (lightAccent.kind === 'preset') return { accent: FROM_SERVER_PRESET[lightAccent.id], customColor };
  return { accent: customColor ? 'custom' : DEFAULT_ACCENT, customColor };
}

/** The same accent for both themes, in the shape the PUT body needs; the custom colour is kept while another tile is chosen. */
export function accentToStored(
  accent: AccentChoice,
  customColor: string | null
): { lightAccent: AccentRef; darkAccent: AccentRef; customPresets: CustomPresetDto[] } {
  const colour = accent === 'custom' ? (customColor ?? DEFAULT_CUSTOM_COLOR) : customColor;
  const customPresets: CustomPresetDto[] = colour
    ? [{ id: CUSTOM_ACCENT_ID, name: CUSTOM_ACCENT_NAME, baseColor: colour }]
    : [];
  const ref: AccentRef =
    accent === 'custom' ? { kind: 'custom', id: CUSTOM_ACCENT_ID } : { kind: 'preset', id: SERVER_PRESET[accent] };
  return { lightAccent: ref, darkAccent: ref, customPresets };
}
