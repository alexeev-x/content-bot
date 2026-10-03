// Token-lean verification: prints one line per step and only the relevant lines of failures.
// The full output goes to .logs/verify.log, which agents read only when the summary is not enough.
// Nothing is filtered from the log itself, so no error line is ever lost.
//
// `--changed` checks only what the current changes touch (pre-push hook, agent stop hook):
// commits not yet pushed + uncommitted work. CI always runs the full set.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand, commandOutput } from './run-command.mjs';

// Fast, cheap checks first so a failure costs the least time.
export const STEPS = [
  ['format', ['npm', 'run', 'format:check']],
  ['lint', ['npm', 'run', 'lint']],
  ['docs', ['npm', 'run', 'check:docs']],
  ['agents', ['npm', 'run', 'agents:check']],
  ['tooling-tests', ['npm', 'test']],
  ['typecheck', ['npm', 'run', 'typecheck']],
  ['architecture', ['npm', 'run', 'depcruise']],
  ['app-tests', ['npm', 'run', 'test:apps']],
  ['build', ['npm', 'run', 'build']],
];

// Changes here can affect everything, so they trigger the full set.
const GLOBAL =
  /^(package(-lock)?\.json|\.nvmrc|\.oxlintrc\.json|\.prettierrc\.json|\.prettierignore|\.dependency-cruiser\.cjs|\.gitleaks(?:\.toml|ignore)?|\.github\/workflows\/.*|apps\/[^/]+\/(package\.json|tsconfig\.json|vite(st)?\.config\.ts|wrangler\.jsonc))$/;
const INSTRUCTIONS =
  /^(AGENTS\.md|README\.md|docs\/|\.agents\/|\.claude\/|\.codex\/|\.husky\/|apps\/[^/]+\/AGENTS\.md$)/;
const PRETTIER_FILES = /\.(ts|tsx|js|mjs|cjs|json|jsonc|css)$/;
const LINT_FILES = /\.(ts|tsx|js|mjs|cjs)$/;

export function planSteps(files, { existingFiles = files } = {}) {
  files = files.map((file) => file.replaceAll('\\', '/'));
  existingFiles = existingFiles.map((file) => file.replaceAll('\\', '/'));
  if (files.some((f) => GLOBAL.test(f))) return STEPS;
  const steps = [];
  const pretty = existingFiles.filter((f) => PRETTIER_FILES.test(f));
  const lintable = existingFiles.filter((f) => LINT_FILES.test(f));
  const contracts = files.some((f) => f.startsWith('apps/contracts/'));
  const backend = contracts || files.some((f) => f.startsWith('apps/backend/'));
  const frontend = contracts || files.some((f) => f.startsWith('apps/frontend/'));
  if (pretty.length) steps.push(['format', ['npx', 'prettier', '--check', '--ignore-unknown', ...pretty]]);
  if (lintable.length) steps.push(['lint', ['npx', 'oxlint', ...lintable]]);
  if (files.some((f) => INSTRUCTIONS.test(f))) {
    steps.push(
      ['docs', ['npm', 'run', 'check:docs']],
      ['agents', ['npm', 'run', 'agents:check']],
      ['tooling-tests', ['npm', 'test']],
    );
  }
  if (contracts) steps.push(['contracts-typecheck', ['npm', 'run', 'typecheck', '-w', '@alexeev/contracts']]);
  if (backend) steps.push(['backend-typecheck', ['npm', 'run', 'typecheck', '-w', '@alexeev/backend']]);
  if (frontend) steps.push(['frontend-typecheck', ['npm', 'run', 'typecheck', '-w', '@alexeev/frontend']]);
  if (backend || frontend) steps.push(['architecture', ['npm', 'run', 'depcruise']]);
  if (backend) steps.push(['backend-tests', ['npm', 'run', 'test', '-w', '@alexeev/backend']]);
  if (frontend) steps.push(['frontend-tests', ['npm', 'run', 'test', '-w', '@alexeev/frontend']]);
  // The frontend build bundles the Worker too, so it also proves the backend still deploys.
  if (backend || frontend) steps.push(['build', ['npm', 'run', 'build', '-w', '@alexeev/frontend']]);
  return steps;
}

const RELEVANT =
  /error|fail|✖|not ok|assert|expected|budget|missing|stale|unknown skill|out of date|TS\d{4}|cannot find|\[warn\]/i;
export const MAX_LINES = 20;

export function relevantLines(output) {
  const lines = output.split('\n').filter((l) => l.trim());
  // npm's own 'Lifecycle script failed' lines repeat on every failure and hide the real cause.
  const hits = lines.filter((l) => RELEVANT.test(l) && !/^\s*[✔✓]/.test(l) && !/^npm (error|ERR)/.test(l.trim()));
  return (hits.length ? hits : lines).slice(-MAX_LINES);
}

export function changedFiles(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  let base = null;
  for (const ref of ['@{upstream}', 'origin/develop']) {
    try {
      base = git('merge-base', 'HEAD', ref).trim();
      break;
    } catch {
      // try the next candidate
    }
  }
  const committed = base
    ? git('diff', '--name-only', '-z', '--no-renames', `${base}...HEAD`).replaceAll('\\', '/')
    : '';
  const working = git('status', '--porcelain', '-z', '--no-renames', '--untracked-files=all')
    .split('\0')
    .filter(Boolean)
    .map((l) => l.slice(3).replaceAll('\\', '/'));
  const files = [...new Set([...committed.split('\0').filter(Boolean), ...working])];
  // Keep deletions for area selection, but never pass missing paths to formatters/linters.
  return { base, files, existingFiles: files.filter((f) => existsSync(join(root, f))) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(fileURLToPath(import.meta.url), '../../..');
  let steps = STEPS;
  if (process.argv.includes('--changed')) {
    const { base, files, existingFiles } = changedFiles(root);
    steps = base === null ? STEPS : planSteps(files, { existingFiles });
    console.log(
      base === null
        ? 'verify --changed: no upstream found, running the full set'
        : `verify --changed: ${files.length} changed file(s), ${steps.length} step(s)`,
    );
  }
  let log = '';
  let failed = 0;
  for (const [name, [cmd, ...args]] of steps) {
    const run = runCommand(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const out = commandOutput(run);
    log += `\n===== ${name}: ${cmd} ${args.join(' ')} (exit ${run.status})\n${out}`;
    if (run.status === 0) {
      console.log(`✓ ${name}`);
      continue;
    }
    failed++;
    console.log(`✗ ${name} (${cmd} ${args.slice(0, 4).join(' ')}${args.length > 4 ? ' …' : ''})`);
    for (const line of relevantLines(out)) console.log(`  ${line.trim().slice(0, 300)}`);
  }
  mkdirSync(join(root, '.logs'), { recursive: true });
  writeFileSync(join(root, '.logs/verify.log'), log);
  console.log(failed ? `verify: ${failed} step(s) failed — full log: .logs/verify.log` : 'verify: all green');
  process.exit(failed ? 1 : 0);
}
