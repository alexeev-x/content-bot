#!/usr/bin/env node
/** typecheck + формат + слои одной командой. Отдельный скрипт, а не цепочка через && — ради Windows. */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bin = (name) => join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);

const fix = process.argv.includes('--fix');

const steps = fix
  ? [
      ['Линт и слои', bin('eslint'), ['.', '--fix']],
      ['Формат', bin('prettier'), ['--write', '.']],
      ['Типы', bin('tsc'), ['--noEmit']],
      ['Тесты', bin('vitest'), ['run']],
      ['Скилы', process.execPath, [join(ROOT, 'scripts', 'skills.js')]],
    ]
  : [
      ['Типы', bin('tsc'), ['--noEmit']],
      ['Линт и слои', bin('eslint'), ['.']],
      ['Формат', bin('prettier'), ['--check', '.']],
      ['Тесты', bin('vitest'), ['run']],
      ['Скилы', process.execPath, [join(ROOT, 'scripts', 'skills.js'), '--check']],
    ];

let failed = false;

for (const [title, command, args] of steps) {
  console.log(`\n▸ ${title}`);
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: false });
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
