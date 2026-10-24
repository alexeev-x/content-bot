import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCommand } from './run-command.mjs';

test('Windows npx resolves its own CLI when npm_execpath points to npm', () => {
  const npmCli = 'C:\\node\\node_modules\\npm\\bin\\npm-cli.js';
  const npxCli = 'C:\\node\\node_modules\\npm\\bin\\npx-cli.js';
  const runtime = {
    platform: 'win32',
    execPath: 'C:\\node\\node.exe',
    env: { npm_execpath: npmCli, PATH: '' },
    existsSync: (path) => path === npmCli || path === npxCli,
  };

  assert.deepEqual(resolveCommand('npx', ['prettier', '--check'], runtime), {
    file: runtime.execPath,
    args: [npxCli, 'prettier', '--check'],
  });
  assert.deepEqual(resolveCommand('npm', ['run', 'lint'], runtime), {
    file: runtime.execPath,
    args: [npmCli, 'run', 'lint'],
  });
});
