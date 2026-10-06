import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  composite,
  contrastRatio,
  measureAccent,
  parseCssColor,
  THEME_SURFACES,
  NON_TEXT_CONTRAST,
  TEXT_CONTRAST,
  type ColorTheme,
  type Rgb
} from '../../shared/lib/color';

// Reads the real token file, so the built-in presets are checked with the values the browser gets.
const css = readFileSync(join(process.cwd(), 'src/app/styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selectors: selector!.split(',').map((s) => s.trim()),
  body: body!
}));

/** Declarations of every block whose selector list names one of `selectors`, in file order. */
function tokensFor(...selectors: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const block of blocks) {
    if (!block.selectors.some((s) => selectors.includes(s))) continue;
    for (const [, name, value] of block.body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) result[name!] = value!.trim();
  }
  return result;
}

const PRESETS = ['cobalt', 'indigo', 'copper', 'orchid', 'mono'] as const;
const THEMES: ColorTheme[] = ['light', 'dark'];
const STATUSES = ['pending', 'active', 'done', 'retry', 'failed', 'unknown', 'muted'] as const;

function resolved(theme: ColorTheme, preset: string): Record<string, string> {
  return tokensFor(`[data-theme='${theme}']`, `[data-theme='${theme}'][data-accent-${theme}='${preset}']`);
}
const color = (tokens: Record<string, string>, name: string) => {
  const parsed = parseCssColor(tokens[name] ?? '');
  if (!parsed) throw new Error(`${name} is missing or not a colour: ${tokens[name]}`);
  return parsed;
};
const opaque = (tokens: Record<string, string>, name: string): Rgb => color(tokens, name);
const SURFACE_NAMES = ['--color-bg', '--color-surface-1', '--color-surface-2', '--color-surface-3'];

describe.each(THEMES)('%s tokens', (theme) => {
  const base = resolved(theme, 'cobalt');

  it('keeps THEME_SURFACES in sync with the surface tokens', () => {
    const fromTokens = SURFACE_NAMES.map((n) => {
      const c = opaque(base, n);
      return `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    });
    expect(fromTokens).toEqual([...THEME_SURFACES[theme]]);
  });

  it('keeps text readable and borders visible on every surface', () => {
    for (const surface of SURFACE_NAMES) {
      const bg = opaque(base, surface);
      expect(contrastRatio(opaque(base, '--color-text'), bg)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(opaque(base, '--color-text-muted'), bg)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
      expect(contrastRatio(opaque(base, '--color-danger'), bg)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
      expect(contrastRatio(opaque(base, '--color-border-strong'), bg)).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
    }
  });

  it('keeps disabled text distinguishable but below muted', () => {
    const surface = opaque(base, '--color-surface-3');
    expect(contrastRatio(opaque(base, '--color-text-disabled'), surface)).toBeLessThan(
      contrastRatio(opaque(base, '--color-text-muted'), surface)
    );
  });

  it('keeps bubble text readable on its bubble', () => {
    expect(contrastRatio(opaque(base, '--color-bubble-text'), opaque(base, '--color-bubble'))).toBeGreaterThanOrEqual(
      TEXT_CONTRAST
    );
    expect(contrastRatio(opaque(base, '--color-bubble-link'), opaque(base, '--color-bubble'))).toBeGreaterThanOrEqual(
      TEXT_CONTRAST
    );
  });

  describe.each(PRESETS)('%s preset', (preset) => {
    const tokens = resolved(theme, preset);

    it('passes the accent contrast checks', () => {
      const checks = measureAccent(
        {
          accent: tokens['--color-accent']!,
          onAccent: tokens['--color-on-accent']!,
          text: tokens['--color-accent-text']!,
          ring: tokens['--color-focus-ring']!,
          soft: tokens['--color-accent-soft']!,
          hover: tokens['--color-accent-hover']!,
          glow: tokens['--color-accent-glow']!
        },
        theme
      );
      expect(checks.onAccent).toBeGreaterThanOrEqual(TEXT_CONTRAST);
      expect(checks.text).toBeGreaterThanOrEqual(TEXT_CONTRAST);
      expect(checks.ring).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
      expect(checks.soft).toBeGreaterThanOrEqual(TEXT_CONTRAST);
      // primary button: on-accent text also holds in the hover shade
      expect(
        contrastRatio(opaque(tokens, '--color-on-accent'), opaque(tokens, '--color-accent-hover'))
      ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
      // the filled button is visible against the page surface
      expect(
        contrastRatio(opaque(tokens, '--color-accent'), opaque(tokens, '--color-surface-1'))
      ).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
    });

    it('keeps every status label at AA on its tint over bg and surface-1', () => {
      for (const status of STATUSES) {
        const fg = opaque(tokens, `--color-status-${status}-fg`);
        const tint = color(tokens, `--color-status-${status}-bg`);
        for (const surface of ['--color-bg', '--color-surface-1']) {
          const ratio = contrastRatio(fg, composite(tint, opaque(tokens, surface)));
          expect(ratio, `${theme} ${preset} ${status} on ${surface}`).toBeGreaterThanOrEqual(TEXT_CONTRAST);
        }
      }
    });
  });

  it('turns active slate for cobalt and indigo, and unknown gold for copper', () => {
    const blue = resolved(theme, 'orchid')['--color-status-active-fg'];
    for (const preset of ['cobalt', 'indigo'])
      expect(resolved(theme, preset)['--color-status-active-fg']).not.toBe(blue);
    expect(resolved(theme, 'copper')['--color-status-unknown-fg']).not.toBe(
      resolved(theme, 'cobalt')['--color-status-unknown-fg']
    );
  });
});
