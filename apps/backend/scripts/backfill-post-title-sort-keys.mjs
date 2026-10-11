import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { postTitleSortKey } from '../src/modules/content/domain/post-title-sort-key.ts';

const backendDir = dirname(dirname(fileURLToPath(import.meta.url)));
const wrangler = join(dirname(dirname(createRequire(import.meta.url).resolve('wrangler'))), 'bin', 'wrangler.js');
const mode = process.argv.slice(2);
const remote = mode.length === 3 && mode[0] === '--remote' && mode[1] === '--env' && mode[2] === 'dev';
const local = mode.length === 1 && mode[0] === '--local';

if (!remote && !local) {
  throw new Error(
    'Use --local or set CLOUDFLARE_ENV=dev and pass --remote --env dev. Production backfills are disabled.'
  );
}

const database = remote ? 'content-db-dev' : 'content-bot';
const environment = remote ? ['--remote', '--env', 'dev', '--yes'] : ['--local'];
const maxRows = 10_000;
const pageSize = 100;
let updated = 0;

function execute(command) {
  const result = spawnSync(
    process.execPath,
    [wrangler, 'd1', 'execute', database, ...environment, '--command', command, '--json'],
    { cwd: backendDir, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
  );
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) throw new Error(`Wrangler D1 command failed (${result.status}): ${result.stderr.trim()}`);
  const start = result.stdout.indexOf('[');
  if (start < 0) throw new Error('Wrangler D1 command did not return JSON.');
  const output = JSON.parse(result.stdout.slice(start));
  const statement = output[0];
  if (statement === undefined || !statement.success) throw new Error('Wrangler D1 statement did not succeed.');
  return statement.results ?? [];
}

while (updated < maxRows) {
  const rows = execute(
    `SELECT id, title FROM posts WHERE title_sort_key = '' ORDER BY id LIMIT ${Math.min(pageSize, maxRows - updated)}`
  );
  if (rows.length === 0) break;

  for (let offset = 0; offset < rows.length; offset += 10) {
    const chunk = rows.slice(offset, offset + 10);
    const statements = chunk.map(({ id, title }) => {
      if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Unexpected post id in D1 backfill result.');
      const key = postTitleSortKey(title);
      if (!/^\d*$/.test(key)) throw new Error('Unexpected sort key in title backfill.');
      const escapedTitle = title.replaceAll("'", "''");
      return `UPDATE posts SET title_sort_key = '${key}' WHERE id = '${id}' AND title_sort_key = '' AND title = '${escapedTitle}';`;
    });

    const directory = mkdtempSync(join(tmpdir(), 'post-title-sort-'));
    const sqlFile = join(directory, 'backfill.sql');
    try {
      writeFileSync(sqlFile, statements.join('\n'), { encoding: 'utf8', flag: 'wx' });
      const result = spawnSync(
        process.execPath,
        [wrangler, 'd1', 'execute', database, ...environment, '--file', sqlFile],
        { cwd: backendDir, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
      );
      if (result.error !== undefined) throw result.error;
      if (result.status !== 0)
        throw new Error(`Wrangler D1 backfill failed (${result.status}): ${result.stderr.trim()}`);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    updated += chunk.length;
  }
}

if (updated === maxRows && execute("SELECT id, title FROM posts WHERE title_sort_key = '' LIMIT 1").length > 0) {
  throw new Error(`Backfilled ${maxRows} posts; rerun the command to continue safely.`);
}

process.stdout.write(`Backfilled title sort keys for ${updated} posts (${remote ? 'DEV D1' : 'local D1'}).\n`);
