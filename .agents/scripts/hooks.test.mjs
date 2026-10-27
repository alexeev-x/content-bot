import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = join(fileURLToPath(import.meta.url), '../../..');
import { decide } from '../hooks/guard-command.mjs';

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
    'gh pr merge 12 --squash',
    'git push origin --delete develop',
    'git push origin :main',
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
    'npm run shots -- --grep "publish"',
    'npm test && git commit -m "feat(publish): x"',
    'git status',
    'rm -rf apps/frontend/dist',
    'cat .env.example.md',
  ])
    assert.equal(decide(cmd), null, `should allow: ${cmd}`);
  assert.ok(decide('npm run deploy'));
  assert.ok(decide('npm run db:migrate:remote'));
  assert.ok(decide('npm run db:migrate:dev'));
  assert.ok(decide('gh workflow run "D1 migrations" -f environment=production --ref main'));
  assert.ok(decide('gh workflow run db-migrate.yml -f environment=dev'));
  assert.ok(decide('gh api -X POST repos/o/r/actions/workflows/db-migrate.yml/dispatches -f ref=develop'));
  assert.ok(decide('gh run rerun 123'));
  assert.equal(decide('gh run list'), null);
  assert.equal(decide('gh workflow list'), null);
  assert.ok(decide('npm run db:migrate:prod -w @alexeev/backend'));
  assert.equal(decide('npm run db:migrate:local'), null);
  assert.equal(decide('npm run deploy:check'), null);
  assert.equal(decide('npx wrangler deploy --dry-run'), null);
  assert.equal(decide('cat .env.example.md'), null);
  assert.equal(decide('Get-Content apps/backend/.dev.vars.example'), null);
  assert.equal(decide("cat > f.jsonc <<'EOF'\n// owner runs wrangler deploy later\nEOF\nls"), null);
  assert.ok(decide("cat <<'EOF'\nx\nEOF\nnpx wrangler deploy"));
  assert.ok(decide('git commit -m x', 'main'));
  assert.ok(decide('git cherry-pick abc', 'main'));
  assert.equal(decide('git commit -m x', 'feat/media'), null);
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

import { relevantLines, MAX_LINES } from './verify.mjs';

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

import { planSteps, selectSteps, STEPS } from './verify.mjs';
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

test('verify runs both app test suites and builds once, the frontend way', () => {
  // The root `build` would re-run every workspace typecheck that the typecheck step already covers.
  assert.equal(STEPS.filter(([name]) => name === 'build').length, 1);
  assert.ok(STEPS.some(([name]) => name === 'backend-tests') && STEPS.some(([name]) => name === 'frontend-tests'));
});

test('verify --only/--skip pick steps by name and reject unknown names', () => {
  const pick = (...argv) => selectSteps(STEPS, ['node', 'verify.mjs', ...argv]).map(([n]) => n);
  assert.equal(pick().length, STEPS.length);
  assert.deepEqual(pick('--only', 'backend-tests'), ['backend-tests']);
  const rest = pick('--skip', 'backend-tests,frontend-tests');
  assert.ok(!rest.includes('backend-tests') && !rest.includes('frontend-tests'));
  // CI may filter a changed-file plan while naming a globally-known step that is absent from that plan.
  const frontendPlan = planSteps(['apps/frontend/src/pages/LoginPage.tsx']);
  const changedRest = selectSteps(
    frontendPlan,
    ['node', 'verify.mjs', '--skip', 'backend-tests,frontend-tests'],
    STEPS,
  ).map(([name]) => name);
  assert.ok(!changedRest.includes('frontend-tests'));
  assert.ok(changedRest.includes('frontend-typecheck'));
  // The CI jobs together cover the whole full set.
  assert.equal(rest.length + 2, STEPS.length);
  assert.throws(() => pick('--only', 'backend-test'), /needs step names/);
  assert.throws(() => pick('--skip'), /needs step names/);
});
