// Applies pending D1 migrations to the local database before `npm run dev`, on Windows and macOS alike.
// stdin is closed so Wrangler treats the run as non-interactive and does not stop to ask for confirmation.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = dirname(dirname(fileURLToPath(import.meta.url)));
// The package exports only its API entry (wrangler-dist/cli.js); the CLI launcher sits next to it in bin/.
const wrangler = join(dirname(dirname(createRequire(import.meta.url).resolve('wrangler'))), 'bin', 'wrangler.js');
const result = spawnSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'content-bot', '--local'], {
  cwd: backendDir,
  stdio: ['ignore', 'inherit', 'inherit']
});
process.exit(result.status ?? 1);
