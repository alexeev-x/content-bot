// Windows cannot exec npm.cmd directly. Run npm's JavaScript entry point without a shell:
// changed filenames remain arguments, not shell syntax.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

export function runCommand(command, args, options = {}) {
  if (process.platform !== 'win32' || !['npm', 'npx'].includes(command)) {
    return spawnSync(command, args, options);
  }
  const entry = `${command}-cli.js`;
  const candidates = [
    ...(process.env.npm_execpath ? [join(dirname(process.env.npm_execpath), entry)] : []),
    ...[dirname(process.execPath), ...(process.env.PATH ?? '').split(delimiter)].map((dir) =>
      join(dir, 'node_modules/npm/bin', entry),
    ),
  ];
  const cli = candidates.find((path) => existsSync(path));
  if (!cli) return { status: null, error: new Error(`Cannot find ${entry}; install npm alongside Node.js.`) };
  return spawnSync(process.execPath, [cli, ...args], options);
}

export const commandOutput = (run) =>
  `${run.stdout ?? ''}${run.stderr ?? ''}${run.error ? `\n${run.error.message}\n` : ''}`;
