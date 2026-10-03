import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, validateRole, renderClaude, renderCodex, plan } from './sync-agents.mjs';
import { checkRepo } from './check-docs.mjs';

const root = join(fileURLToPath(import.meta.url), '../../..');
const meta = { name: 'backend', description: 'Says "hi" \\ ok', claude_model: 'sonnet', claude_tools: 'Read, Bash', effort: 'high', codex_sandbox: 'workspace-write', area_rules: 'apps/backend/AGENTS.md' };

test('parses frontmatter, unquotes values and rejects YAML-unsafe ones', () => {
  const { meta: m, body } = parseFrontmatter('---\nname: x\ndescription: "d: with colon «ok»"\n---\nBody\n');
  assert.deepEqual(m, { name: 'x', description: 'd: with colon «ok»' });
  assert.equal(body, 'Body\n');
  assert.throws(() => parseFrontmatter('---\nname: x\ndescription: d: with colon\n---\nB\n'), /quote the value/);
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
  const { files, links } = plan(root);
  assert.ok(files.has('.codex/agents/qa-security.toml'));
  assert.ok(links.has('.claude/skills/orchestrate'));
  assert.deepEqual(checkRepo(root), []);
});
