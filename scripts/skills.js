#!/usr/bin/env node
/**
 * Раскладывает скилы по папкам агентов из единственного источника — `docs/skills/*.md`.
 *
 *   pnpm skills          — разложить
 *   pnpm skills --check  — проверить, что разложенное совпадает с источником (в pnpm check)
 *
 * Зачем копии, а не ссылки: Claude Code ищет `.claude/skills/`, Codex и Cursor — `.agents/skills/`,
 * а симлинки ломаются на Windows без режима разработчика. Полный текст вместо ссылки на документ —
 * чтобы агент получил правила сразу, не делая лишний шаг, который может и не сделать.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from './dev-vars.js';

const SOURCE = join(ROOT, 'docs', 'skills');
const TARGETS = ['.claude/skills', '.agents/skills'];

const safeRead = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
};

const check = process.argv.includes('--check');
const skills = readdirSync(SOURCE).filter((name) => name.endsWith('.md'));
const stale = [];

for (const file of skills) {
  const content = readFileSync(join(SOURCE, file), 'utf8');
  const name = file.replace(/\.md$/, '');

  for (const target of TARGETS) {
    const path = join(ROOT, target, name, 'SKILL.md');

    if (check) {
      const current = safeRead(path);
      if (current !== content) stale.push(`${target}/${name}/SKILL.md`);
      continue;
    }

    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

if (check && stale.length > 0) {
  console.error(`Скилы разошлись с docs/skills:\n${stale.map((p) => `  ✗ ${p}`).join('\n')}\nПочини: pnpm skills`);
  process.exit(1);
}

console.log(check ? 'Скилы совпадают с docs/skills.' : `Разложено скилов: ${skills.length} × ${TARGETS.length}.`);
