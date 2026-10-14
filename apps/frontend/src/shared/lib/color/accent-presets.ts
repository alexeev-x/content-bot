import type { AccentRef, CustomPresetDto } from '@alexeev/contracts';

/** The eight accents the owner picks from; tokens.css defines each for light and dark. One accent serves both themes. */
export const ACCENT_IDS = ['blue', 'orange', 'violet', 'teal', 'green', 'pink', 'red', 'graphite'] as const;
export type AccentId = (typeof ACCENT_IDS)[number];
export const DEFAULT_ACCENT: AccentId = 'blue';

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

/** Reads the one accent from the stored light/dark pair; anything else (an old custom colour) is blue. */
export function accentFromStored({ lightAccent }: { lightAccent: AccentRef }): AccentId {
  return lightAccent.kind === 'preset' ? FROM_SERVER_PRESET[lightAccent.id] : DEFAULT_ACCENT;
}

/** The same accent for both themes, in the shape the PUT body needs; old custom colours are dropped. */
export function accentToStored(id: AccentId): {
  lightAccent: AccentRef;
  darkAccent: AccentRef;
  customPresets: CustomPresetDto[];
} {
  const ref: AccentRef = { kind: 'preset', id: SERVER_PRESET[id] };
  return { lightAccent: ref, darkAccent: ref, customPresets: [] };
}
