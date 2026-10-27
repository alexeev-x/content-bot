// Local preview of rubric pictures without DEV: `node .agents/scripts/rubric-preview.mjs [rubric_key …]`.
// Bundles rubric-preview/entry.ts with esbuild, renders each picture page with headless Chrome into
// .logs/rubric-preview/<key>.png (+ .html). The game data is live; STRATZ numbers are made up (RUBRIC_SEED varies them).
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const bundle = `${root}.logs/rubric-preview/entry.mjs`;
await build({
  entryPoints: [fileURLToPath(new URL('./rubric-preview/entry.ts', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: bundle,
  logLevel: 'warning',
});
execFileSync(process.execPath, [bundle, `${root}.logs/rubric-preview`, ...process.argv.slice(2)], { stdio: 'inherit' });
