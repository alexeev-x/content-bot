// Stop / SubagentStop hook (Claude Code + Codex): a builder may not finish while `npm run verify` is red.
// Runs only when the working tree changed since the last green run; blocks at most twice per tree state.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_BLOCKS = 2;
// Read-only or planning agents cannot fix code, so blocking them only burns tokens.
export const SKIP_AGENTS = new Set(['qa-security', 'product-analyst', 'Explore', 'Plan', 'claude-code-guide', 'statusline-setup']);

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

export function treeHash(root) {
  const h = createHash('sha256').update(git(root, ['diff', 'HEAD', '--binary']));
  for (const f of git(root, ['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)) {
    const abs = join(root, f);
    h.update(f);
    if (existsSync(abs) && statSync(abs).isFile() && statSync(abs).size < 1_000_000) h.update(readFileSync(abs));
  }
  return h.digest('hex');
}

export function shouldBlock({ verifyPassed, blocksSoFar, stopHookActive }) {
  if (verifyPassed) return false;
  if (stopHookActive && blocksSoFar >= 1) return false;
  return blocksSoFar < MAX_BLOCKS;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw || '{}');
  if (process.env.AGENT_VERIFY_ON_STOP === '0' || SKIP_AGENTS.has(input.agent_type)) process.exit(0);
  const root = git(input.cwd ?? process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  if (!git(root, ['status', '--porcelain']).trim()) process.exit(0);

  const stateDir = join(root, '.agent-metrics');
  const stateFile = join(stateDir, 'verify-state.json');
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { lastGreen: null, blocks: {} };
  const hash = treeHash(root);
  if (state.lastGreen === hash) process.exit(0);

  const run = spawnSync('npm', ['run', 'verify'], { cwd: root, encoding: 'utf8', timeout: 300_000 });
  const passed = run.status === 0;
  const blocksSoFar = state.blocks[hash] ?? 0;
  const block = shouldBlock({ verifyPassed: passed, blocksSoFar, stopHookActive: Boolean(input.stop_hook_active) });
  if (passed) state.lastGreen = hash;
  if (block) state.blocks = { [hash]: blocksSoFar + 1 };
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state));

  if (block) {
    // verify.mjs already prints a capped summary of failures; pass it through as-is.
    const tail = (run.stdout ?? '').split('\n').filter((l) => l.trim() && !l.startsWith('>')).slice(-25).join('\n');
    process.stdout.write(JSON.stringify({ decision: 'block', reason: `npm run verify is failing (block ${blocksSoFar + 1}/${MAX_BLOCKS}). Fix the cause, or report NOT_VERIFIED with the reason. Relevant lines:\n${tail}` }));
  }
}
