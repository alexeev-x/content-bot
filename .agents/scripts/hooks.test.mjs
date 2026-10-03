import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(fileURLToPath(import.meta.url), '../../..');
import { decide } from '../hooks/guard-command.mjs';
import {
  shouldBlock,
  appliesTo,
  mainBlocksInWindow,
  MAIN_WINDOW_MS,
  othersRunning,
  exactVerificationResult,
  canReuseVerification,
} from '../hooks/verify-on-stop.mjs';
import { update, readRunning, record, STALE_MS } from '../hooks/track-builders.mjs';
import { sumTranscript } from '../hooks/log-usage.mjs';

test('guard blocks owner-only and destructive commands', () => {
  for (const cmd of [
    'npx wrangler deploy',
    'npx wrangler d1 migrations apply content-bot --remote',
    'wrangler secret put TELEGRAM_BOT_TOKEN',
    'npx wrangler versions deploy',
    'git push --force origin feat/x',
    'git push -f',
    'git -C . push --force-with-lease origin feat/x',
    'git push origin main',
    'git push origin HEAD:main',
    'git push origin +HEAD:refs/heads/main',
    'wrangler deploy --dry-run; wrangler deploy',
    'npm run deploy:check && npm.cmd run deploy',
    'powershell -Command "wrangler deploy"',
    'npm exec -- wrangler d1 migrations apply content-bot --remote',
    'Get-Content apps/backend/.dev.vars',
    'type .env.local',
    'cat apps/backend/.dev.vars',
    'head .env.production',
    'rm -rf ~',
    'Remove-Item C:\\ -Recurse -Force',
    'Remove-Item $env:USERPROFILE -Force -Recurse',
    'npm publish',
  ])
    assert.ok(decide(cmd), `should block: ${cmd}`);
});

test('guard allows normal work and blocks commits only on protected branches', () => {
  for (const cmd of [
    'npm run verify',
    'npx wrangler d1 migrations apply content-bot --local',
    'npx wrangler dev',
    'npx wrangler types',
    'git push origin develop',
    'git push -u origin feat/agent-system',
    'git status',
    'rm -rf apps/frontend/dist',
    'cat .env.example.md',
  ])
    assert.equal(decide(cmd), null, `should allow: ${cmd}`);
  assert.ok(decide('npm run deploy'));
  assert.ok(decide('npm run db:migrate:remote'));
  assert.equal(decide('npm run deploy:check'), null);
  assert.equal(decide('npx wrangler deploy --dry-run'), null);
  assert.equal(decide('cat .env.example.md'), null);
  assert.equal(decide('Get-Content apps/backend/.dev.vars.example'), null);
  assert.equal(decide("cat > f.jsonc <<'EOF'\n// owner runs wrangler deploy later\nEOF\nls"), null);
  assert.ok(decide("cat <<'EOF'\nx\nEOF\nnpx wrangler deploy"));
  assert.ok(decide('git commit -m x', 'main'));
  assert.equal(decide('git commit -m x', 'develop'), null);
});

test('command hook emits a machine-readable denial without running the command', () => {
  const guard = fileURLToPath(new URL('../hooks/guard-command.mjs', import.meta.url));
  const result = execFileSync(process.execPath, [guard], {
    cwd: root,
    encoding: 'utf8',
    input: JSON.stringify({ cwd: root, tool_input: { command: 'wrangler deploy --dry-run; wrangler deploy' } }),
  });
  const output = JSON.parse(result);
  assert.equal(output.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /owner/);
});

test('main session blocks are counted per 30-minute window', () => {
  const now = 10 * MAIN_WINDOW_MS;
  assert.equal(mainBlocksInWindow([now - 1000, now - 2000, now - MAIN_WINDOW_MS - 1], now), 2);
  assert.equal(mainBlocksInWindow(undefined, now), 0);
});

test('verify-on-stop applies only to the main session and builder roles', () => {
  assert.equal(appliesTo(undefined), true);
  assert.equal(appliesTo('backend'), true);
  assert.equal(appliesTo('general-purpose'), false);
  assert.equal(appliesTo('qa-security'), false);
});

test('verify-on-stop blocks at most twice and respects Codex stop_hook_active', () => {
  assert.equal(shouldBlock({ verifyPassed: true, blocksSoFar: 0, stopHookActive: false }), false);
  assert.equal(shouldBlock({ verifyPassed: false, blocksSoFar: 0, stopHookActive: false }), true);
  assert.equal(shouldBlock({ verifyPassed: false, blocksSoFar: 2, stopHookActive: false }), false);
  assert.equal(shouldBlock({ verifyPassed: false, blocksSoFar: 1, stopHookActive: true }), false);
});

test('usage is summed once per message id', () => {
  const line = (id, out) =>
    JSON.stringify({
      message: {
        id,
        model: 'm',
        usage: { input_tokens: 1, output_tokens: out, cache_creation_input_tokens: 10, cache_read_input_tokens: 100 },
      },
    });
  const r = sumTranscript([line('a', 5), line('a', 7), line('b', 3), 'not json "usage"'].join('\n'));
  assert.deepEqual(r, {
    messages: 2,
    models: { m: 2 },
    input_tokens: 2,
    output_tokens: 10,
    cache_creation_input_tokens: 20,
    cache_read_input_tokens: 200,
  });
});

import { relevantLines, MAX_LINES } from './verify.mjs';
import { summarize, units } from './metrics.mjs';

test('verify keeps error lines and caps output', () => {
  const out = [
    'ok 1',
    'src/a.ts(3,5): error TS2322: bad',
    'noise',
    ...Array.from({ length: 50 }, (_, i) => `x error ${i}`),
  ].join('\n');
  const lines = relevantLines(out);
  assert.equal(lines.length, MAX_LINES);
  assert.ok(lines.every((l) => /error/.test(l)));
  assert.deepEqual(relevantLines('a\nb\nc'), ['a', 'b', 'c']);
  assert.deepEqual(relevantLines('✔ rejects missing fields\n✖ broken: expected 1'), ['✖ broken: expected 1']);
});

test('metrics sums main and subagents into relative cost units', () => {
  const u = { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 20 };
  assert.equal(units(u), 10 + 125 + 100 + 100);
  const s = summarize({ session_id: 's', branch: 'b', updated: 't', main: u, subagents: { a: u } });
  assert.equal(s.output_tokens, 40);
  assert.equal(s.units, 670);
});

test('verify waits while builders run and tracks only builder agents', () => {
  let running = {};
  running = update(running, { event: 'SubagentStart', agentId: 'a1', agentType: 'backend' }, 1);
  running = update(running, { event: 'SubagentStart', agentId: 'x', agentType: 'general-purpose' }, 1);
  assert.deepEqual(Object.keys(running), ['a1']);
  assert.equal(othersRunning(running, undefined), true); // main session waits
  assert.equal(othersRunning(running, 'a1'), false); // a lone builder still verifies itself
  running = update(running, { event: 'SubagentStart', agentId: 'a2', agentType: 'frontend' }, 1);
  assert.equal(othersRunning(running, 'a1'), true); // parallel builders don't block each other
  running = update(running, { event: 'SubagentStop', agentId: 'a1', agentType: 'backend' });
  running = update(running, { event: 'SubagentStop', agentId: 'a2', agentType: 'frontend' });
  assert.deepEqual(running, {});
  assert.deepEqual(readRunning('/nonexistent-root'), {});
});

test('verification passes only for the exact unchanged snapshot with no active builder', () => {
  assert.equal(
    exactVerificationResult({ status: 0, beforeHash: 'same', afterHash: 'same', otherBuildersRunning: false }),
    true,
  );
  assert.equal(
    exactVerificationResult({ status: 0, beforeHash: 'before', afterHash: 'after', otherBuildersRunning: false }),
    false,
  );
  assert.equal(
    exactVerificationResult({ status: 0, beforeHash: 'same', afterHash: 'same', otherBuildersRunning: true }),
    false,
  );
  assert.equal(
    exactVerificationResult({ status: null, beforeHash: 'same', afterHash: 'same', otherBuildersRunning: false }),
    false,
  );
  assert.equal(canReuseVerification({ lastGreen: 'same', coverage: 'verify:changed' }, 'same'), true);
  assert.equal(canReuseVerification({ lastGreen: 'same', coverage: 'verify' }, 'same'), false);
  assert.equal(canReuseVerification({ lastGreen: 'same' }, 'same'), false);
});

test('builder registrations survive concurrent start and stop hooks', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'alexeev-builders-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  const script = fileURLToPath(new URL('../hooks/track-builders.mjs', import.meta.url));
  const send = (event, agentId) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script], { cwd: root, stdio: ['pipe', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
      child.once('error', reject);
      child.once('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr || `exit ${code}`))));
      child.stdin.end(JSON.stringify({ hook_event_name: event, agent_id: agentId, agent_type: 'backend' }));
    });
  const ids = Array.from({ length: 12 }, (_, i) => `builder-${i}`);

  await Promise.all(ids.map((id) => send('SubagentStart', id)));
  assert.deepEqual(Object.keys(readRunning(root)).sort(), [...ids].sort());
  await Promise.all(ids.slice(0, 7).map((id) => send('SubagentStop', id)));
  assert.deepEqual(Object.keys(readRunning(root)).sort(), ids.slice(7).sort());
});

test('stale builder registrations are ignored and a new start replaces them', () => {
  const root = mkdtempSync(join(tmpdir(), 'alexeev-stale-builder-'));
  try {
    const now = Date.now();
    record(root, { event: 'SubagentStart', agentId: 'builder', agentType: 'backend' }, now - STALE_MS - 1);
    assert.deepEqual(readRunning(root, now), {});
    record(root, { event: 'SubagentStart', agentId: 'builder', agentType: 'backend' }, now);
    assert.deepEqual(readRunning(root, now), { builder: now });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

import { planSteps, STEPS } from './verify.mjs';
const names = (files, options) => planSteps(files, options).map(([n]) => n);

test('verify --changed runs only what the changes touch', () => {
  assert.deepEqual(names(['apps/frontend/src/pages/LoginPage.tsx']), [
    'format',
    'lint',
    'frontend-typecheck',
    'architecture',
    'frontend-tests',
    'build',
  ]);
  assert.deepEqual(names(['apps/backend/src/app/create-app.ts']), [
    'format',
    'lint',
    'backend-typecheck',
    'architecture',
    'backend-tests',
    'build',
  ]);
  assert.ok(names(['apps/contracts/src/posts.ts']).includes('frontend-tests'));
  assert.ok(names(['apps/contracts/src/posts.ts']).includes('backend-tests'));
  assert.deepEqual(names(['docs/DECISIONS.md']), ['docs', 'agents', 'tooling-tests']);
  assert.deepEqual(names(['apps\\backend\\src\\deleted.ts'], { existingFiles: [] }), [
    'backend-typecheck',
    'architecture',
    'backend-tests',
    'build',
  ]);
  assert.equal(names(['package-lock.json'], { existingFiles: [] }).length, STEPS.length);
  assert.equal(names(['.github/workflows/ci.yml']).length, STEPS.length);
  assert.deepEqual(names(['.husky/pre-push']), ['docs', 'agents', 'tooling-tests']);
  assert.equal(planSteps(['package.json']), STEPS);
  assert.equal(planSteps(['apps/backend/wrangler.jsonc']), STEPS);
  assert.deepEqual(names([]), []);
});
