#!/usr/bin/env node
/**
 * Локальный воркер.
 *
 *   pnpm dev             — поднять воркер на 8787
 *   pnpm dev --port 8788 — другой порт
 *
 * Отдельный скрипт, а не строка в package.json: сюда вернутся шаги, которые появятся вместе
 * с архитектурой (миграции хранилища, мост внешнего входа), и он одинаково работает
 * в zsh и PowerShell.
 */
import { spawnSync } from 'node:child_process';
import { ROOT } from './root.js';
import { toolPath } from './tool-path.js';

const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex === -1 ? '8787' : (args[portIndex + 1] ?? '8787');

const result = spawnSync(process.execPath, [toolPath('wrangler'), 'dev', '--env', 'dev', '--port', port], {
  cwd: ROOT,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
