// Token-lean verification: prints one line per step and only the relevant lines of failures.
// The full output goes to .logs/verify.log, which agents read only when the summary is not enough.
// Nothing is filtered from the log itself, so no error line is ever lost.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STEPS = [
  ['docs', ['run', 'check:docs']],
  ['agents', ['run', 'agents:check']],
  ['tests', ['test']],
  ['typecheck', ['run', 'typecheck']],
  ['build', ['run', 'build']],
];
const RELEVANT = /error|fail|✖|not ok|assert|expected|budget|missing|stale|unknown skill|out of date|TS\d{4}|cannot find/i;
export const MAX_LINES = 20;

export function relevantLines(output) {
  const lines = output.split('\n').filter((l) => l.trim());
  const hits = lines.filter((l) => RELEVANT.test(l) && !/^\s*[✔✓]/.test(l));
  return (hits.length ? hits : lines).slice(-MAX_LINES);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(fileURLToPath(import.meta.url), '../../..');
  let log = '';
  let failed = 0;
  for (const [name, args] of STEPS) {
    const run = spawnSync('npm', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    log += `\n===== ${name}: npm ${args.join(' ')} (exit ${run.status})\n${out}`;
    if (run.status === 0) { console.log(`✓ ${name}`); continue; }
    failed++;
    console.log(`✗ ${name} (npm ${args.join(' ')})`);
    for (const line of relevantLines(out)) console.log(`  ${line.trim().slice(0, 300)}`);
  }
  mkdirSync(join(root, '.logs'), { recursive: true });
  writeFileSync(join(root, '.logs/verify.log'), log);
  console.log(failed ? `verify: ${failed} step(s) failed — full log: .logs/verify.log` : 'verify: all green');
  process.exit(failed ? 1 : 0);
}
