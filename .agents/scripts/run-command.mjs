// Windows cannot exec npm.cmd directly. Run npm's JavaScript entry point without a shell:
// changed filenames remain arguments, not shell syntax.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join, win32 } from 'node:path';

export function runCommand(command, args, options = {}, runtime = {}) {
  const platform = runtime.platform ?? process.platform;
  const spawn = runtime.spawnSync ?? spawnSync;
  if (platform !== 'win32' || !['npm', 'npx'].includes(command)) {
    return spawn(command, args, options);
  }
  const pathApi = platform === 'win32' ? win32 : { dirname, join };
  const entry = `${command}-cli.js`;
  const env = runtime.env ?? process.env;
  const execPath = runtime.execPath ?? process.execPath;
  const searchPath = env.PATH ?? '';
  const candidates = [
    ...(env.npm_execpath ? [env.npm_execpath, pathApi.join(pathApi.dirname(env.npm_execpath), entry)] : []),
    ...[pathApi.dirname(execPath), ...searchPath.split(platform === 'win32' ? ';' : delimiter)].map((dir) =>
      pathApi.join(dir, 'node_modules', 'npm', 'bin', entry),
    ),
  ];
  const cli = [...new Set(candidates)].find((path) => (runtime.existsSync ?? existsSync)(path));
  if (!cli) return { status: null, error: new Error(`Cannot find ${entry}; install npm alongside Node.js.`) };
  return spawn(execPath, [cli, ...args], options);
}

export const commandOutput = (run) =>
  `${run.stdout ?? ''}${run.stderr ?? ''}${run.error ? `\n${run.error.message}\n` : ''}`;
