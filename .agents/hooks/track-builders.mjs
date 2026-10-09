// SubagentStart / SubagentStop hook (Claude Code + Codex): one file per builder avoids
// lost registrations when independent hook processes start or stop agents concurrently.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BUILDER_AGENTS = new Set(['backend', 'frontend', 'design-system', 'ui-prototyper']);
// A crashed agent never sends SubagentStop; forget it after this long.
export const STALE_MS = 2 * 60 * 60 * 1000;

export function runningDirectory(root) {
  return join(root, '.agent-metrics', 'running-builders');
}

export function readRunning(root, now = Date.now()) {
  const dir = runningDirectory(root);
  if (!existsSync(dir)) return {};
  const running = {};
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.json'))) {
    try {
      const entry = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      if (typeof entry.agentId === 'string' && typeof entry.startedAt === 'number' && now - entry.startedAt < STALE_MS)
        running[entry.agentId] = entry.startedAt;
    } catch {
      // An incomplete/corrupt registration cannot prove a builder is running.
    }
  }
  return running;
}

export function update(running, { event, agentId, agentType }, now = Date.now()) {
  if (!agentId || !BUILDER_AGENTS.has(agentType)) return running;
  const next = { ...running };
  if (event === 'SubagentStart') next[agentId] = now;
  if (event === 'SubagentStop') delete next[agentId];
  return next;
}

export function record(root, { event, agentId, agentType }, now = Date.now()) {
  if (!agentId || !BUILDER_AGENTS.has(agentType)) return;
  const dir = runningDirectory(root);
  mkdirSync(dir, { recursive: true });
  const filename = `${createHash('sha256').update(agentId).digest('hex')}.json`;
  const file = join(dir, filename);
  if (event === 'SubagentStart') {
    const temporary = `${file}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
    writeFileSync(temporary, JSON.stringify({ agentId, startedAt: now }));
    renameSync(temporary, file);
  }
  if (event === 'SubagentStop') rmSync(file, { force: true });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw || '{}');
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: input.cwd ?? process.cwd(),
    encoding: 'utf8',
  }).trim();
  record(root, {
    event: input.hook_event_name,
    agentId: input.agent_id,
    // Codex field names for subagent events are not documented; accept the likely variants.
    agentType: input.agent_type ?? input.agent_name ?? input.subagent_type,
  });
}
