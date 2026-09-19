#!/usr/bin/env node
/** typecheck + формат + слои одной командой. Отдельный скрипт, а не цепочка через && — ради Windows. */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolPath } from './tool-path.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bin = (name) => toolPath(name === 'tsc' ? 'typescript' : name, name);

const fix = process.argv.includes('--fix');

const steps = fix
  ? [
      ['Линт и слои', bin('eslint'), ['.', '--fix']],
      ['Формат', bin('prettier'), ['--write', '.']],
      ['Типы', bin('tsc'), ['--noEmit']],
      ['Типы тестов', bin('tsc'), ['-p', 'tsconfig.test.json']],
      ['Тесты', bin('vitest'), ['run']],
      ['Архитектура и скрипты', process.execPath, ['--test', 'scripts/tests/*.test.js']],
      ['Скилы', process.execPath, [join(ROOT, 'scripts', 'skills.js')]],
    ]
  : [
      ['Типы', bin('tsc'), ['--noEmit']],
      ['Типы тестов', bin('tsc'), ['-p', 'tsconfig.test.json']],
      ['Линт и слои', bin('eslint'), ['.']],
      ['Формат', bin('prettier'), ['--check', '.']],
      ['Тесты', bin('vitest'), ['run']],
      ['Архитектура и скрипты', process.execPath, ['--test', 'scripts/tests/*.test.js']],
      ['Скилы', process.execPath, [join(ROOT, 'scripts', 'skills.js'), '--check']],
    ];

let failed = false;

for (const [title, command, args] of steps) {
  console.log(`\n▸ ${title}`);
  const result = spawnSync(process.execPath, command === process.execPath ? args : [command, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
