// SubagentStart / SubagentStop hook (Claude Code): remembers which builder agents are running, so
// verify-on-stop stays silent until they all finish (checking half-done work only burns tokens).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BUILDER_AGENTS = new Set(['backend', 'frontend', 'design-system']);
// A crashed agent never sends SubagentStop; forget it after this long.
export const STALE_MS = 2 * 60 * 60 * 1000;

export function runningFile(root) {
  return join(root, '.agent-metrics', 'running-builders.json');
}

export function readRunning(root, now = Date.now()) {
  const file = runningFile(root);
  if (!existsSync(file)) return {};
  const all = JSON.parse(readFileSync(file, 'utf8'));
  return Object.fromEntries(Object.entries(all).filter(([, startedAt]) => now - startedAt < STALE_MS));
}

export function update(running, { event, agentId, agentType }, now = Date.now()) {
  if (!agentId || !BUILDER_AGENTS.has(agentType)) return running;
  const next = { ...running };
  if (event === 'SubagentStart') next[agentId] = now;
  if (event === 'SubagentStop') delete next[agentId];
  return next;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw || '{}');
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: input.cwd ?? process.cwd(),
    encoding: 'utf8',
  }).trim();
  const next = update(readRunning(root), {
    event: input.hook_event_name,
    agentId: input.agent_id,
    // Codex field names for subagent events are not documented; accept the likely variants.
    agentType: input.agent_type ?? input.agent_name ?? input.subagent_type,
  });
  mkdirSync(join(root, '.agent-metrics'), { recursive: true });
  writeFileSync(runningFile(root), JSON.stringify(next));
}
