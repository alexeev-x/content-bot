import { describe, expect, it } from 'vitest';
import { accentFromStored, accentToStored, CUSTOM_ACCENT_ID } from './accent-presets';
import { deriveAccent } from './derive-accent';
import { contrastRatio, parseHex } from './srgb';

const rgb = (hex: string) => parseHex(hex)!;

describe('deriveAccent', () => {
  it.each(['#ffff00', '#000000', '#ffffff', '#d9468f', '#00ffcc', '#102030'])(
    'keeps text and focus contrast for %s in both themes',
    (base) => {
      for (const [theme, surface] of [
        ['light', '#ffffff'],
        ['dark', '#111113']
      ] as const) {
        const d = deriveAccent(base, theme);
        expect(contrastRatio(rgb(d.onAccent), rgb(d.accent))).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(rgb(d.text), rgb(surface))).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(rgb(d.ring), rgb(surface))).toBeGreaterThanOrEqual(3);
      }
    }
  );
});

describe('custom accent storage', () => {
  it('reads a stored custom colour back as the custom tile', () => {
    const stored = accentToStored('custom', '#12ab34');
    expect(stored.lightAccent).toEqual({ kind: 'custom', id: CUSTOM_ACCENT_ID });
    expect(accentFromStored(stored)).toEqual({ accent: 'custom', customColor: '#12ab34' });
  });

  it('keeps the colour while a preset is chosen', () => {
    const stored = accentToStored('teal', '#12ab34');
    expect(accentFromStored(stored)).toEqual({ accent: 'teal', customColor: '#12ab34' });
  });
});
