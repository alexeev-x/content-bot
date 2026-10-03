// PreToolUse hook (Claude Code + Codex): hard-blocks commands that AGENTS.md reserves for the owner.
// Instructions can be ignored by a model; a hook cannot. Output format is shared by both tools.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const RULES = [
  [/\bwrangler\b[^|;&]*\b(deploy|publish|rollback|delete)\b/, 'Deploys, rollbacks and deletes are run by the owner.'],
  [/\bwrangler\b[^|;&]*\bversions\s+(deploy|secret)\b/, 'Version deploys and versioned secrets are run by the owner.'],
  [/\bwrangler\b[^|;&]*\bsecret\b/, 'Secrets are set by the owner (`wrangler secret put` deploys immediately).'],
  [/\bwrangler\b[^|;&]*--remote\b/, 'Remote D1/R2/KV commands touch real data; use --local.'],
  [/\bgit\s+push\b[^|;&]*(\s--force\b|\s-f\b|--force-with-lease)/, 'Force-push is forbidden.'],
  [/\bgit\s+push\b[^|;&]*\s(origin\s+)?(HEAD:)?(main|develop)\b/, 'Never push to main/develop directly; open a PR from feat/*.'],
  [/\bnpm\s+publish\b/, 'Publishing packages is not part of this project.'],
  [/(^|[\s;&|])(cat|less|more|head|tail|bat)\s+[^|;&]*(\.dev\.vars|\.env(\.[\w-]+)?)(\s|$)/, 'Secret files must not be read into the transcript.'],
  [/\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(\/|~|\$HOME|\.\.)(\s|\/?$)/, 'Recursive delete of a root, home or parent directory.'],
];

function currentBranch(cwd) {
  try { return execFileSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf8' }).trim(); } catch { return ''; }
}

export function decide(command, branch = '') {
  for (const [re, reason] of RULES) if (re.test(command)) return reason;
  if (/\bgit\s+(commit|merge|rebase)\b/.test(command) && ['main', 'develop'].includes(branch)) {
    return `You are on ${branch}. Create feat/<slug> from develop first.`;
  }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw || '{}');
  const command = input.tool_input?.command ?? '';
  const reason = command ? decide(command, currentBranch(input.cwd ?? process.cwd())) : null;
  if (reason) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `Blocked by .agents/hooks/guard-command.mjs: ${reason}` } }));
  }
}
