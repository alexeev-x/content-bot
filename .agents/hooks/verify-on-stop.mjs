// Stop / SubagentStop hook (Claude Code + Codex): a builder may not finish while `npm run verify` is red.
// Runs only when the working tree changed since the last green run; blocks at most twice per tree state.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRunning } from './track-builders.mjs';

export const MAX_BLOCKS = 2;
// Only the main session and builder roles are held to a green verify; read-only, research or
// translation agents cannot fix unrelated failures, so blocking them only burns tokens.
export const BUILDER_AGENTS = new Set(['backend', 'frontend', 'design-system']);
export const appliesTo = (agentType) => !agentType || BUILDER_AGENTS.has(agentType);

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

export const MAIN_WINDOW_MS = 30 * 60 * 1000;

export function othersRunning(running, selfId) {
  return Object.keys(running).some((id) => id !== selfId);
}

export function shouldBlock({ verifyPassed, blocksSoFar, stopHookActive }) {
  if (verifyPassed) return false;
  if (stopHookActive && blocksSoFar >= 1) return false;
  return blocksSoFar < MAX_BLOCKS;
}

// The main session often waits while background builders change files, so a per-tree-state cap
// never trips there. Cap it by time instead: at most MAX_BLOCKS blocks per 30 minutes.
export function mainBlocksInWindow(timestamps = [], now = Date.now()) {
  return timestamps.filter((t) => now - t < MAIN_WINDOW_MS).length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw || '{}');
  const agentType = input.agent_type ?? input.agent_name ?? input.subagent_type;
  if (process.env.AGENT_VERIFY_ON_STOP === '0' || !appliesTo(agentType)) process.exit(0);
  const root = git(input.cwd ?? process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  if (!git(root, ['status', '--porcelain']).trim()) process.exit(0);
  // Let running builders finish first: verify then sees complete work, not someone's half-done edits.
  if (othersRunning(readRunning(root), input.agent_id)) process.exit(0);

  const stateDir = join(root, '.agent-metrics');
  const stateFile = join(stateDir, 'verify-state.json');
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { lastGreen: null, blocks: {} };
  const hash = treeHash(root);
  if (state.lastGreen === hash) process.exit(0);

  const run = spawnSync('npm', ['run', 'verify:changed'], { cwd: root, encoding: 'utf8', timeout: 300_000 });
  const passed = run.status === 0;
  const isMain = !agentType;
  const now = Date.now();
  const blocksSoFar = isMain ? mainBlocksInWindow(state.mainBlocks, now) : (state.blocks[hash] ?? 0);
  const block = shouldBlock({ verifyPassed: passed, blocksSoFar, stopHookActive: Boolean(input.stop_hook_active) });
  if (passed) state.lastGreen = hash;
  if (block && isMain) state.mainBlocks = [...(state.mainBlocks ?? []).filter((t) => now - t < MAIN_WINDOW_MS), now];
  if (block && !isMain) state.blocks = { [hash]: blocksSoFar + 1 };
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state));

  if (block) {
    // verify.mjs already prints a capped summary of failures; pass it through as-is.
    const tail = (run.stdout ?? '')
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('>'))
      .slice(-25)
      .join('\n');
    process.stdout.write(
      JSON.stringify({
        decision: 'block',
        reason: `npm run verify is failing (block ${blocksSoFar + 1}/${MAX_BLOCKS}). Fix the cause, or report NOT_VERIFIED with the reason. Relevant lines:\n${tail}`,
      }),
    );
  }
}
