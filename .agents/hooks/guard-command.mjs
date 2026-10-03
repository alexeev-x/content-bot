// PreToolUse hook (Claude Code + Codex): best-effort command guard, not a security boundary.
// Enforce production access with the host sandbox and credentials policy as well.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const RULES = [
  [
    /\bwrangler(?:\.cmd)?\b[^\r\n]*\b(deploy|publish|rollback|delete)\b/i,
    'Deploys, rollbacks and deletes are run by the owner.',
  ],
  [
    /\bwrangler(?:\.cmd)?\b[^\r\n]*\bversions\s+(deploy|secret)\b/i,
    'Version deploys and versioned secrets are run by the owner.',
  ],
  [
    /\bwrangler(?:\.cmd)?\b[^\r\n]*\bsecret\b/i,
    'Secrets are set by the owner (`wrangler secret put` deploys immediately).',
  ],
  [/\bwrangler(?:\.cmd)?\b[^\r\n]*--remote\b/i, 'Remote D1/R2/KV commands touch real data; use --local.'],
  [
    /\bgit(?:\.exe)?\b[^\r\n]*\bpush\b[^\r\n]*(?:--force(?:-with-lease)?(?:=\S*)?|(?:^|\s)-f(?:\s|$))/i,
    'Force-push is forbidden.',
  ],
  [
    /\bgit(?:\.exe)?\b[^\r\n]*\bpush\b[^\r\n]*(?:\+?)(?:HEAD:)?(?:refs\/heads\/)?main(?:\s|$|:)/i,
    'Never push to main; releases go through a PR from develop.',
  ],
  [
    /\bgit(?:\.exe)?\b[^\r\n]*\bpush\b[^\r\n]*--(?:all|mirror)\b/i,
    'Bulk pushes can update protected branches; use a reviewed release PR.',
  ],
  [
    /\b(?:npm(?:\.cmd)?|pnpm(?:\.cmd)?|yarn|bun)\b[^\r\n]*\bpublish\b/i,
    'Publishing packages is not part of this project.',
  ],
  [
    /\b(?:npm(?:\.cmd)?|pnpm(?:\.cmd)?|yarn|bun)\b[^\r\n]*\brun\s+(?:(?:--workspace|-w)\s+\S+\s+|--workspace=\S+\s+|--if-present\s+)*(?:deploy(?!:check)\b|db:migrate:remote\b)/i,
    'Deploys and remote migrations are run by the owner.',
  ],
  [
    /(?:^|[\s"'`=])(?:[^\s"'`]*[\\/])?\.env(?:\.[\w.-]+)?(?=$|[\s"'`,;])/i,
    'Secret files must not be read or copied into the transcript.',
  ],
  [
    /(?:^|[\s"'`=])(?:[^\s"'`]*[\\/])?\.dev\.vars(?:\.[\w.-]+)?(?=$|[\s"'`,;])/i,
    'Secret files must not be read or copied into the transcript.',
  ],
  [
    /\b(?:powershell|pwsh)\b[^\r\n]*-(?:encodedcommand|enc)\b/i,
    'Encoded PowerShell commands cannot be safely inspected.',
  ],
  [
    /\b(?:remove-item|ri|rm|rmdir|rd|del)\b(?=[^\r\n]*-(?:recurse|r)\b)(?=[^\r\n]*-(?:force|f)\b)[^\r\n]*(?:[a-z]:[\\/](?:["'`\s]|$)|%userprofile%(?:[\\/]|["'`\s]|$)|\$env:userprofile\b|\$home\b|~[\\/])/i,
    'Recursive delete of a drive root or user home directory.',
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
  const command = stripHeredocs(rawCommand)
    .replace(/(?:^|[\s"'`=])(?:[^\s"'`]*[\\/])?\.env\.example(?:\.md)?(?=$|[\s"'`,;])/gi, ' <env-example>')
    .replace(/(?:^|[\s"'`=])(?:[^\s"'`]*[\\/])?\.dev\.vars\.example(?=$|[\s"'`,;])/gi, ' <dev-vars-example>');
  // Permit only the standalone explicit dry-run form. A prefix exception allowed
  // `wrangler deploy --dry-run; wrangler deploy` to bypass every rule.
  if (/^\s*(?:npx\s+)?wrangler(?:\.cmd)?\s+deploy\s+--dry-run\s*$/i.test(command)) return null;
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
