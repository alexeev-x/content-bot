// «Тестирование» never ships to production (owner, 26.10.2026): CI runs this after the production build and fails when
// the SPA or the Worker bundle still calls a lab route. The marker is the route prefix as a string literal in code
// (`"/api/v1/lab…`, any quote); comments that mention it carry no quote before it. Usage: node scripts/check-no-lab.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const DIST = path.join(import.meta.dirname, '..', 'dist');
const MARKER = /["'`]\/api\/v1\/lab\b/;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* files(full);
    else if (/\.(js|mjs|html)$/.test(name)) yield full;
  }
}

const found = [...files(DIST)].filter((file) => MARKER.test(readFileSync(file, 'utf8')));
if (found.length > 0) {
  console.error(
    `«Тестирование» is in the production build:\n${found.map((file) => path.relative(DIST, file)).join('\n')}`
  );
  process.exit(1);
}
console.log('check-no-lab: no lab code in dist');
