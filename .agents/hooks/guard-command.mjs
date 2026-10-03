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
  [/\bgit\s+push\b[^|;&]*\s(origin\s+)?(HEAD:)?main\b/, 'Never push to main; releases go through a PR from develop.'],
  [/\bnpm\s+publish\b/, 'Publishing packages is not part of this project.'],
  [/\bnpm\s+run\s+(deploy(?!:check)|db:migrate:remote)\b/, 'Deploys and remote migrations are run by the owner.'],
  [
    /(^|[\s;&|])(cat|less|more|head|tail|bat)\s+[^|;&]*(\.dev\.vars|\.env(\.[\w-]+)?)(\s|$)/,
    'Secret files must not be read into the transcript.',
  ],
  [
    /\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(\/|~|\$HOME|\.\.)(\s|\/?$)/,
    'Recursive delete of a root, home or parent directory.',
  ],
];

function currentBranch(cwd) {
  try {
    return execFileSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

// Heredoc bodies are data written to files, not commands; checking them causes false blocks.
export function stripHeredocs(command) {
  return command.replace(/<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\1(?=\n|$)/g, '<<heredoc');
}

export function decide(rawCommand, branch = '') {
  const command = stripHeredocs(rawCommand);
  if (/\bwrangler\b[^|;&]*\bdeploy\b[^|;&]*--dry-run\b/.test(command)) return null;
  for (const [re, reason] of RULES) if (re.test(command)) return reason;
  if (/\bgit\s+(commit|merge|rebase)\b/.test(command) && branch === 'main') {
    return 'You are on main. Work on develop; main changes only through a release PR.';
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
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Blocked by .agents/hooks/guard-command.mjs: ${reason}`,
        },
      }),
    );
  }
}
