import type { AppearanceDto, ThemeMode } from '@alexeev/contracts';
import { accentFromStored, accentToStored, type AccentId } from '../../../shared/lib/color';

/** What the owner edits: the theme mode and one accent for both themes. */
export type AppearanceValue = {
  themeMode: ThemeMode;
  accent: AccentId;
};

export type ThemeName = 'light' | 'dark';

export const toValue = (dto: AppearanceDto): AppearanceValue => ({
  themeMode: dto.themeMode,
  accent: accentFromStored(dto)
});

/** The PUT body for a value: the same accent for light and dark; the contract itself is unchanged. */
export const toInput = (value: AppearanceValue, revision: number) => ({
  revision,
  themeMode: value.themeMode,
  ...accentToStored(value.accent)
});
