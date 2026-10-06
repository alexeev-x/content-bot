import type { AccentPresetId } from '@alexeev/contracts';
import type { CSSProperties, ElementType, ReactNode } from 'react';
import { deriveAccent, type DerivedAccent } from '../../../shared/lib/color';
import type { ThemeName } from '../model/appearance-value';

export type AccentSource = { kind: 'preset'; id: AccentPresetId } | { kind: 'custom'; baseColor: string };

// Mirrors the --custom-<theme>-* names tokens.css reads (and app/theme.ts injects for the live document).
const SUFFIX: Record<keyof DerivedAccent, string> = {
  accent: 'accent',
  hover: 'accent-hover',
  text: 'accent-text',
  soft: 'accent-soft',
  onAccent: 'on-accent',
  ring: 'focus-ring',
  glow: 'accent-glow'
};

function customVariables(theme: ThemeName, baseColor: string): CSSProperties {
  const derived = deriveAccent(baseColor, theme);
  const variables: Record<string, string> = {};
  for (const key of Object.keys(SUFFIX) as (keyof DerivedAccent)[]) {
    variables[`--custom-${theme}-${SUFFIX[key]}`] = derived[key];
  }
  return variables as CSSProperties;
}

type Props = {
  theme: ThemeName;
  accent: AccentSource;
  as?: ElementType;
  className?: string;
  children?: ReactNode;
};

/** Re-scopes the tokens to one theme and accent, so a swatch or preview shows that theme whatever the page uses. */
export function ThemeScope({ theme, accent, as: Tag = 'div', className, children }: Props) {
  const value = accent.kind === 'preset' ? accent.id : 'custom';
  const attributes = theme === 'light' ? { 'data-accent-light': value } : { 'data-accent-dark': value };
  const style = accent.kind === 'custom' ? customVariables(theme, accent.baseColor) : undefined;
  return (
    <Tag data-theme={theme} {...attributes} style={style} className={className}>
      {children}
    </Tag>
  );
}
