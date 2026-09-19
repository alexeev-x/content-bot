#!/usr/bin/env node
/**
 * Деплой окружения: сначала миграции D1, потом воркер.
 *   pnpm deploy:dev   /  pnpm deploy:prod
 *
 * Порядок важен: если выкатить код раньше схемы, он обратится к таблице, которой ещё нет.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IS_WINDOWS = process.platform === 'win32';
const wrangler = join(ROOT, 'node_modules', '.bin', IS_WINDOWS ? 'wrangler.cmd' : 'wrangler');

const env = process.argv[2];

if (env !== 'dev' && env !== 'production') {
  console.error('Укажи окружение: node scripts/deploy.js dev | production');
  process.exit(1);
}

const steps = [
  ['Миграции D1', ['d1', 'migrations', 'apply', 'DB', '--env', env, '--remote']],
  ['Деплой воркера', ['deploy', '--env', env]],
];

for (const [title, args] of steps) {
  console.log(`\n▸ ${title} (${env})`);
  const result = spawnSync(wrangler, args, { cwd: ROOT, stdio: 'inherit', shell: IS_WINDOWS });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
