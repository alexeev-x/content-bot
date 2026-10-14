import type { AppearanceDto, ThemeMode } from '@alexeev/contracts';
import { accentFromStored, accentToStored, type AccentChoice } from '../../../shared/lib/color';

/** What the owner edits: the theme mode, one accent for both themes and the stored custom colour (if any). */
export type AppearanceValue = {
  themeMode: ThemeMode;
  accent: AccentChoice;
  customColor: string | null;
};

export type ThemeName = 'light' | 'dark';

export const toValue = (dto: AppearanceDto): AppearanceValue => ({
  themeMode: dto.themeMode,
  ...accentFromStored(dto)
});

/** The PUT body for a value: the same accent for light and dark; the contract itself is unchanged. */
export const toInput = (value: AppearanceValue, revision: number) => ({
  revision,
  themeMode: value.themeMode,
  ...accentToStored(value.accent, value.customColor)
});
