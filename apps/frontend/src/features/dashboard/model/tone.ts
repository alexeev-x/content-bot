import type { CSSProperties } from 'react';
import type { StatusGroup } from '../../../shared/ui';

/** Sets the `--tone-*` custom properties of a status group, so a widget part takes the status hue from the tokens. */
export function toneStyle(group: StatusGroup): CSSProperties {
  return {
    '--tone-fg': `var(--color-status-${group}-fg)`,
    '--tone-bg': `var(--color-status-${group}-bg)`,
    '--tone-ring': `var(--color-status-${group}-ring)`
  } as CSSProperties;
}

/** Lines the first letter of a channel name: the avatar of a channel without a picture. */
export function avatarLetter(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?';
}

/** The owner's accent as a tone, for the parts that are about the product itself rather than a status. */
export const accentStyle = {
  '--tone-fg': 'var(--color-accent-text)',
  '--tone-bg': 'var(--color-accent-soft)',
  '--tone-ring': 'var(--color-accent)'
} as CSSProperties;
