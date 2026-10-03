import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, validateRole, renderClaude, renderCodex, plan } from './sync-agents.mjs';
import { checkRepo } from './check-docs.mjs';

const root = join(fileURLToPath(import.meta.url), '../../..');
const meta = {
  name: 'backend',
  description: 'Says "hi" \\ ok',
  claude_model: 'sonnet',
  claude_tools: 'Read, Bash',
  effort: 'high',
  codex_sandbox: 'workspace-write',
  area_rules: 'apps/backend/AGENTS.md',
};

test('parses frontmatter, unquotes values and rejects YAML-unsafe ones', () => {
  const { meta: m, body } = parseFrontmatter('---\nname: x\ndescription: "d: with colon «ok»"\n---\nBody\n');
  assert.deepEqual(m, { name: 'x', description: 'd: with colon «ok»' });
  assert.equal(body, 'Body\n');
  assert.throws(() => parseFrontmatter('---\nname: x\ndescription: d: with colon\n---\nB\n'), /quote the value/);
});

test('parses CRLF frontmatter without changing the generated instructions', () => {
  const lf = '---\nname: example\ndescription: "Example"\n---\nBody\n';
  assert.deepEqual(parseFrontmatter(lf.replaceAll('\n', '\r\n')), parseFrontmatter(lf));
});

test('rejects unknown, missing and mismatched role fields', () => {
  assert.throws(() => validateRole({ ...meta, colour: 'red' }, 'backend.md'), /unknown field/);
  assert.throws(() => validateRole({ ...meta, effort: '' }, 'backend.md'), /missing "effort"/);
  assert.throws(() => validateRole(meta, 'frontend.md'), /name must match/);
});

test('Claude adapter maps fields and does not force an extra read of area rules', () => {
  const out = renderClaude({ ...meta, max_turns: '10' }, 'Body\n');
  assert.match(out, /^---\nname: backend\ndescription: "Says \\"hi\\" \\\\ ok"\n/);
  assert.match(out, /\nmodel: sonnet\n/);
  assert.match(out, /\nmaxTurns: 10\n/);
  assert.doesNotMatch(out, /read apps\/backend\/AGENTS\.md/);
});

test('Codex adapter escapes TOML strings and points to area rules', () => {
  const out = renderCodex(meta, 'Body\n');
  assert.match(out, /description = "Says \\"hi\\" \\\\ ok"/);
  assert.match(out, /developer_instructions = '''\nBefore any edit, read apps\/backend\/AGENTS\.md/);
  assert.throws(() => renderCodex(meta, "bad ''' body"), /must not contain/);
});

test('repository adapters and docs are consistent', () => {
  const { files, skills } = plan(root);
  assert.ok(files.has('.codex/agents/qa-security.toml'));
  assert.ok(skills.has('.claude/skills/orchestrate/SKILL.md'));
  assert.ok(skills.has('.claude/skills/orchestrate/references/risk-qa.md'));
  assert.deepEqual(checkRepo(root), []);
});

test('secret file patterns are ignored while example templates remain trackable', () => {
  const ignored = (path) => {
    try {
      execFileSync('git', ['check-ignore', '--no-index', '--quiet', path], { cwd: root });
      return true;
    } catch {
      return false;
    }
  };
  for (const path of ['.env', '.env.local', 'apps/backend/.env.production', '.dev.vars', 'apps/backend/.dev.vars.prod'])
    assert.equal(ignored(path), true, `must ignore ${path}`);
  for (const path of ['.env.example', 'apps/backend/.dev.vars.example'])
    assert.equal(ignored(path), false, `must keep template trackable: ${path}`);
});

test('Prettier accepts the worktree line endings used by Windows and Linux', () => {
  const prettier = JSON.parse(readFileSync(join(root, '.prettierrc.json'), 'utf8'));
  assert.equal(prettier.endOfLine, 'auto');
});
