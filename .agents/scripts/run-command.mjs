// Windows cannot exec npm.cmd directly. Run npm's JavaScript entry point without a shell:
// changed filenames remain arguments, not shell syntax.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join, win32 } from 'node:path';

/** The executable and arguments to spawn, or an error when npm's entry point cannot be found. */
export function resolveCommand(command, args, runtime = {}) {
  const platform = runtime.platform ?? process.platform;
  if (platform !== 'win32' || !['npm', 'npx'].includes(command)) return { file: command, args };
  const pathApi = platform === 'win32' ? win32 : { dirname, join };
  const entry = `${command}-cli.js`;
  const env = runtime.env ?? process.env;
  const execPath = runtime.execPath ?? process.execPath;
  const searchPath = env.PATH ?? '';
  const candidates = [
    ...(env.npm_execpath
      ? [...(command === 'npm' ? [env.npm_execpath] : []), pathApi.join(pathApi.dirname(env.npm_execpath), entry)]
      : []),
    ...[pathApi.dirname(execPath), ...searchPath.split(platform === 'win32' ? ';' : delimiter)].map((dir) =>
      pathApi.join(dir, 'node_modules', 'npm', 'bin', entry),
    ),
  ];
  const cli = [...new Set(candidates)].find((path) => (runtime.existsSync ?? existsSync)(path));
  if (!cli) return { error: new Error(`Cannot find ${entry}; install npm alongside Node.js.`) };
  return { file: execPath, args: [cli, ...args] };
}

export function runCommand(command, args, options = {}, runtime = {}) {
  const resolved = resolveCommand(command, args, runtime);
  if (resolved.error) return { status: null, error: resolved.error };
  return (runtime.spawnSync ?? spawnSync)(resolved.file, resolved.args, options);
}

/** Same as runCommand, but lets several commands run at once. Resolves with spawnSync's result shape. */
export function runCommandAsync(command, args, options = {}, runtime = {}) {
  const resolved = resolveCommand(command, args, runtime);
  if (resolved.error) return Promise.resolve({ status: null, error: resolved.error });
  return new Promise((resolve) => {
    const child = spawn(resolved.file, resolved.args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => resolve({ status: null, stdout, stderr, error }));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

export const commandOutput = (run) =>
  `${run.stdout ?? ''}${run.stderr ?? ''}${run.error ? `\n${run.error.message}\n` : ''}`;
