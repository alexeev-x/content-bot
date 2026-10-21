// Before `npm run dev`: the owner keeps local secrets in one place, the repository's root `.env` (owner, 21.10.2026).
// The local Worker reads only `apps/backend/.dev.vars`, so the root keys are merged into it: a root key adds or
// replaces that key, every other line of `.dev.vars` stays. Values are never printed. Both files are git-ignored.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = join(fileURLToPath(import.meta.url), '../..');
const rootEnv = join(backend, '../../.env');
const devVars = join(backend, '.dev.vars');
const KEY_LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

if (!existsSync(rootEnv)) process.exit(0);
const root = new Map();
for (const line of readFileSync(rootEnv, 'utf8').split(/\r?\n/)) {
  const key = KEY_LINE.exec(line)?.[1];
  if (key) root.set(key, line.replace(/^\s*export\s+/, '').trim());
}
const kept = existsSync(devVars) ? readFileSync(devVars, 'utf8').split(/\r?\n/) : [];
const out = kept.map((line) => {
  const key = KEY_LINE.exec(line)?.[1];
  if (key === undefined || !root.has(key)) return line;
  const next = root.get(key);
  root.delete(key);
  return next;
});
while (out.length > 0 && out.at(-1) === '') out.pop();
out.push(...root.values());
writeFileSync(devVars, `${out.join('\n')}\n`);
console.log('dev vars: root .env merged into apps/backend/.dev.vars');
