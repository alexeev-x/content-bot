import test from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../hooks/guard-command.mjs';
import { shouldBlock } from '../hooks/verify-on-stop.mjs';
import { sumTranscript } from '../hooks/log-usage.mjs';

test('guard blocks owner-only and destructive commands', () => {
  for (const cmd of [
    'npx wrangler deploy', 'npx wrangler d1 migrations apply content-bot --remote', 'wrangler secret put TELEGRAM_BOT_TOKEN',
    'npx wrangler versions deploy', 'git push --force origin feat/x', 'git push -f', 'git push origin main',
    'git push origin HEAD:main', 'cat apps/backend/.dev.vars', 'head .env.production', 'rm -rf ~', 'npm publish',
  ]) assert.ok(decide(cmd), `should block: ${cmd}`);
});

test('guard allows normal work and blocks commits only on protected branches', () => {
  for (const cmd of [
    'npm run verify', 'npx wrangler d1 migrations apply content-bot --local', 'npx wrangler dev', 'npx wrangler types',
    'git push origin develop', 'git push -u origin feat/agent-system', 'git status', 'rm -rf apps/frontend/dist', 'cat .env.example.md',
  ]) assert.equal(decide(cmd), null, `should allow: ${cmd}`);
  assert.ok(decide('git commit -m x', 'main'));
  assert.equal(decide('git commit -m x', 'develop'), null);
});

test('verify-on-stop blocks at most twice and respects Codex stop_hook_active', () => {
  assert.equal(shouldBlock({ verifyPassed: true, blocksSoFar: 0, stopHookActive: false }), false);
  assert.equal(shouldBlock({ verifyPassed: false, blocksSoFar: 0, stopHookActive: false }), true);
  assert.equal(shouldBlock({ verifyPassed: false, blocksSoFar: 2, stopHookActive: false }), false);
  assert.equal(shouldBlock({ verifyPassed: false, blocksSoFar: 1, stopHookActive: true }), false);
});

test('usage is summed once per message id', () => {
  const line = (id, out) => JSON.stringify({ message: { id, model: 'm', usage: { input_tokens: 1, output_tokens: out, cache_creation_input_tokens: 10, cache_read_input_tokens: 100 } } });
  const r = sumTranscript([line('a', 5), line('a', 7), line('b', 3), 'not json "usage"'].join('\n'));
  assert.deepEqual(r, { messages: 2, models: { m: 2 }, input_tokens: 2, output_tokens: 10, cache_creation_input_tokens: 20, cache_read_input_tokens: 200 });
});

import { relevantLines, MAX_LINES } from './verify.mjs';
import { summarize, units } from './metrics.mjs';

test('verify keeps error lines and caps output', () => {
  const out = ['ok 1', 'src/a.ts(3,5): error TS2322: bad', 'noise', ...Array.from({ length: 50 }, (_, i) => `x error ${i}`)].join('\n');
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
