// Token-lean verification: prints one line per step and only the relevant lines of failures.
// The full output goes to .logs/verify.log, which agents read only when the summary is not enough.
// Nothing is filtered from the log itself, so no error line is ever lost.
//
// `--changed` checks only what the current changes touch (pre-push hook, agent stop hook):
// commits not yet pushed + uncommitted work. CI always runs the full set.
// `--only a,b` / `--skip a,b` pick steps of the full set by name: CI runs the slow test suites on separate
// runners, so each gets the whole machine.
//
// Light steps run at once; heavy ones (tsc, test pools, build) run one after another alongside them, because
// all of them together exhaust a 16 GB laptop's memory and macOS starts force-quitting apps.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommandAsync, commandOutput } from './run-command.mjs';

// The frontend build bundles the Worker too, so it also proves the backend still deploys. Plain `vite build`:
// the typecheck steps already run tsc.
const BUILD = ['build', ['npm', 'exec', '-w', '@alexeev/frontend', '--', 'vite', 'build']];

const HEAVY = new Set([
  'typecheck',
  'contracts-typecheck',
  'backend-typecheck',
  'frontend-typecheck',
  'backend-tests',
  'frontend-tests',
  'build',
]);

export const STEPS = [
  ['format', ['npm', 'run', 'format:check']],
  ['lint', ['npm', 'run', 'lint']],
  ['docs', ['npm', 'run', 'check:docs']],
  ['agents', ['npm', 'run', 'agents:check']],
  ['tooling-tests', ['npm', 'test']],
  ['typecheck', ['npm', 'run', 'typecheck']],
  ['architecture', ['npm', 'run', 'depcruise']],
  ['backend-tests', ['npm', 'run', 'test', '-w', '@alexeev/backend']],
  ['frontend-tests', ['npm', 'run', 'test', '-w', '@alexeev/frontend']],
  BUILD,
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
  if (backend || frontend) steps.push(BUILD);
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

/** Applies `--only` / `--skip`; an unknown step name is an error, so a typo never skips a check silently. */
export function selectSteps(steps, argv) {
  const list = (flag) => {
    const index = argv.indexOf(flag);
    if (index === -1) return null;
    const names = (argv[index + 1] ?? '').split(',').filter(Boolean);
    const unknown = names.filter((name) => !steps.some(([step]) => step === name));
    if (!names.length || unknown.length) {
      throw new Error(`${flag} needs step names from: ${steps.map(([step]) => step).join(', ')}`);
    }
    return names;
  };
  const only = list('--only');
  const skip = list('--skip');
  return steps.filter(([name]) => (!only || only.includes(name)) && !skip?.includes(name));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(fileURLToPath(import.meta.url), '../../..');
  let steps = selectSteps(STEPS, process.argv);
  if (process.argv.includes('--changed')) {
    const { base, files, existingFiles } = changedFiles(root);
    steps = base === null ? STEPS : planSteps(files, { existingFiles });
    console.log(
      base === null
        ? 'verify --changed: no upstream found, running the full set'
        : `verify --changed: ${files.length} changed file(s), ${steps.length} step(s)`,
    );
  }
  const runStep = async ([name, [cmd, ...args]]) => {
    const started = Date.now();
    const run = await runCommandAsync(cmd, args, { cwd: root });
    const seconds = Math.round((Date.now() - started) / 1000);
    const out = commandOutput(run);
    if (run.status === 0) {
      console.log(`✓ ${name} (${seconds}s)`);
    } else {
      console.log(`✗ ${name} (${seconds}s; ${cmd} ${args.slice(0, 4).join(' ')}${args.length > 4 ? ' …' : ''})`);
      for (const line of relevantLines(out)) console.log(`  ${line.trim().slice(0, 300)}`);
    }
    return { name, cmd, args, status: run.status, out };
  };
  const runHeavy = async () => {
    const results = [];
    for (const step of steps.filter(([name]) => HEAVY.has(name))) results.push(await runStep(step));
    return results;
  };
  const [light, heavy] = await Promise.all([
    Promise.all(steps.filter(([name]) => !HEAVY.has(name)).map(runStep)),
    runHeavy(),
  ]);
  const byName = new Map([...light, ...heavy].map((r) => [r.name, r]));
  const runs = steps.map(([name]) => byName.get(name));
  // The log keeps the plan's order, whatever order the steps finished in.
  const log = runs.map((r) => `\n===== ${r.name}: ${r.cmd} ${r.args.join(' ')} (exit ${r.status})\n${r.out}`).join('');
  const failed = runs.filter((r) => r.status !== 0).length;
  mkdirSync(join(root, '.logs'), { recursive: true });
  writeFileSync(join(root, '.logs/verify.log'), log);
  console.log(failed ? `verify: ${failed} step(s) failed — full log: .logs/verify.log` : 'verify: all green');
  process.exit(failed ? 1 : 0);
}
