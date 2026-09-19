#!/usr/bin/env node
/** Проверки для commit/push с понятным итогом. Отдельный скрипт — одинаково работает на Windows и macOS. */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolPath } from './tool-path.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bin = (name) => toolPath(name === 'tsc' ? 'typescript' : name, name);

const fix = process.argv.includes('--fix');
const commitOnly = process.argv.includes('--commit');

const color = (code, value) => `\x1b[${code}m${value}\x1b[0m`;
const success = (value) => color('32', `✅ ${value}`);
const failure = (value) => color('31', `❌ ${value}`);

const fullSteps = fix
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

const commitSteps = [
  ['ESLint изменённых файлов', bin('lint-staged'), []],
  ['TypeScript', bin('tsc'), ['--noEmit']],
  ['Prettier', bin('prettier'), ['--check', '.']],
];

const steps = commitOnly ? commitSteps : fullSteps;

let failed = false;
const summary = [];

for (const [title, command, args] of steps) {
  console.log(`\n▸ ${title}`);
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, command === process.execPath ? args : [command, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  const durationMs = Date.now() - startedAt;
  const passed = !result.error && result.status === 0;
  summary.push({ title, durationMs, passed });
  if (result.error) console.error(result.error.message);
  console.log(
    passed ? success(`${title}: пройдено (${durationMs} мс)`) : failure(`${title}: ошибка (${durationMs} мс)`),
  );
  if (!passed) failed = true;
}

console.log(`\n${failed ? failure('Проверки не пройдены.') : success('Все проверки пройдены.')}`);
for (const item of summary) console.log(`${item.passed ? '  ✅' : '  ❌'} ${item.title} — ${item.durationMs} мс`);

process.exit(failed ? 1 : 0);
