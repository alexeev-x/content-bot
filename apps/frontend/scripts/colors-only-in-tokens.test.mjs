// Design lives in tokens: a raw colour anywhere else bypasses the theme and Telegram colour scheme.
// A Node test, not Vitest: Vitest stubs CSS imports, so the stylesheets must be read from disk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;
const SRC = fileURLToPath(new URL('../src', import.meta.url));
const TOKENS_FILE = 'app/styles/tokens.css';

function findColorLiterals(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').match(COLOR_LITERAL) ?? [];
}

const stylesheets = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.css'))
  .map((f) => ({ path: relative(SRC, join(SRC, f)), css: readFileSync(join(SRC, f), 'utf8') }));

test('detects hex and colour functions but ignores comments and var()', () => {
  assert.deepEqual(findColorLiterals('a { color: #fff; background: oklch(0.5 0 0); }'), ['#fff', 'oklch(']);
  assert.deepEqual(findColorLiterals('/* #000 */ a { color: var(--color-text); }'), []);
});

test('colour literals appear only in the token file', () => {
  const tokens = stylesheets.find((s) => s.path === TOKENS_FILE);
  assert.ok(tokens && findColorLiterals(tokens.css).length > 0, `${TOKENS_FILE} must be read and define the palette`);
  const offenders = stylesheets
    .filter((s) => s.path !== TOKENS_FILE)
    .map((s) => ({ path: s.path, colors: findColorLiterals(s.css) }))
    .filter((s) => s.colors.length > 0);
  assert.deepEqual(offenders, []);
});
