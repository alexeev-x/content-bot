#!/usr/bin/env node
/**
 * Деплой окружения: пока это только воркер.
 *   pnpm deploy:dev   /  pnpm deploy:prod
 *
 * Появится хранилище — его миграции встают сюда ПЕРЕД деплоем: выкатить код раньше схемы значит
 * обратиться к таблице, которой ещё нет.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolPath } from './tool-path.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = toolPath('wrangler');

const env = process.argv[2];

if (env !== 'dev' && env !== 'production') {
  console.error('Укажи окружение: node scripts/deploy.js dev | production');
  process.exit(1);
}

const steps = [['Деплой воркера', ['deploy', '--env', env]]];

for (const [title, args] of steps) {
  console.log(`\n▸ ${title} (${env})`);
  const result = spawnSync(process.execPath, [wrangler, ...args], { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
