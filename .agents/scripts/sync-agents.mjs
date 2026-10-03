// Generates runtime adapters from the single source of truth:
//   .agents/roles/<role>.md         -> .claude/agents/<role>.md, .codex/agents/<role>.toml
//   .agents/skills/<name>/      -> .claude/skills/<name> (symlink)
// `--check` verifies adapters are up to date without writing (used in CI).
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync, lstatSync, readlinkSync, symlinkSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROLE_FIELDS = ['name', 'description', 'claude_model', 'claude_tools', 'effort', 'max_turns', 'codex_sandbox', 'area_rules'];
const REQUIRED = ['name', 'description', 'claude_model', 'claude_tools', 'effort', 'codex_sandbox'];
const BANNER = 'GENERATED from .agents/roles/{name}.md by .agents/scripts/sync-agents.mjs. Edit the source, then run `npm run agents:sync`.';

export function parseFrontmatter(text, file = 'input') {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`${file}: missing frontmatter`);
  const meta = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue;
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (!kv) throw new Error(`${file}: bad frontmatter line "${line}"`);
    const raw = kv[2].trim();
    // Keep frontmatter valid YAML for Claude Code and Codex: values with ": " or " #" must be quoted.
    if (!raw.startsWith('"') && /: | #/.test(raw)) throw new Error(`${file}: quote the value of "${kv[1]}" (contains ": " or " #")`);
    meta[kv[1]] = raw.startsWith('"') ? JSON.parse(raw) : raw;
  }
  return { meta, body: match[2].trim() + '\n' };
}

export function validateRole(meta, file) {
  for (const key of Object.keys(meta)) if (!ROLE_FIELDS.includes(key)) throw new Error(`${file}: unknown field "${key}"`);
  for (const key of REQUIRED) if (!meta[key]) throw new Error(`${file}: missing "${key}"`);
  if (meta.name !== basename(file, '.md')) throw new Error(`${file}: name must match file name`);
}

export function renderClaude(meta, body) {
  const lines = ['---', `name: ${meta.name}`, `description: ${JSON.stringify(meta.description)}`, `tools: ${meta.claude_tools}`, `model: ${meta.claude_model}`, `effort: ${meta.effort}`];
  if (meta.max_turns) lines.push(`maxTurns: ${meta.max_turns}`);
  lines.push('---', `<!-- ${BANNER.replace('{name}', meta.name)} -->`, '');
  // Claude Code loads <area>/AGENTS.md automatically when it reads files there, so no extra read is requested.
  return lines.join('\n') + body;
}

const tomlString = (s) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

export function renderCodex(meta, body) {
  // Codex only loads AGENTS.md files from the repo root down to its working directory.
  const preface = meta.area_rules ? `Before any edit, read ${meta.area_rules} (area rules and code style).\n\n` : '';
  const instructions = preface + body;
  if (instructions.includes("'''")) throw new Error(`${meta.name}: body must not contain '''`);
  return [
    `# ${BANNER.replace('{name}', meta.name)}`,
    `name = ${tomlString(meta.name)}`,
    `description = ${tomlString(meta.description)}`,
    `model_reasoning_effort = ${tomlString(meta.effort)}`,
    `sandbox_mode = ${tomlString(meta.codex_sandbox)}`,
    `developer_instructions = '''`,
    instructions.trimEnd(),
    `'''`,
    '',
  ].join('\n');
}

export function plan(root) {
  const files = new Map();
  const links = new Map();
  for (const file of readdirSync(join(root, '.agents/roles')).filter((f) => f.endsWith('.md')).sort()) {
    const { meta, body } = parseFrontmatter(readFileSync(join(root, '.agents/roles', file), 'utf8'), `.agents/roles/${file}`);
    validateRole(meta, file);
    files.set(`.claude/agents/${meta.name}.md`, renderClaude(meta, body));
    files.set(`.codex/agents/${meta.name}.toml`, renderCodex(meta, body));
  }
  for (const name of readdirSync(join(root, '.agents/skills')).sort()) {
    if (!existsSync(join(root, '.agents/skills', name, 'SKILL.md'))) continue;
    links.set(`.claude/skills/${name}`, `../../.agents/skills/${name}`);
  }
  return { files, links };
}

function generatedIn(root, dir, ext) {
  const abs = join(root, dir);
  return existsSync(abs) ? readdirSync(abs).filter((f) => f.endsWith(ext)).map((f) => `${dir}/${f}`) : [];
}

function run(root, check) {
  const { files, links } = plan(root);
  const problems = [];
  for (const [path, content] of files) {
    const abs = join(root, path);
    const current = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
    if (current === content) continue;
    if (check) problems.push(`out of date: ${path}`);
    else { mkdirSync(join(abs, '..'), { recursive: true }); writeFileSync(abs, content); }
  }
  for (const [path, target] of links) {
    const abs = join(root, path);
    const ok = existsSync(abs) && lstatSync(abs).isSymbolicLink() && readlinkSync(abs) === target;
    if (ok) continue;
    if (check) problems.push(`missing symlink: ${path} -> ${target}`);
    else { mkdirSync(join(abs, '..'), { recursive: true }); rmSync(abs, { recursive: true, force: true }); symlinkSync(target, abs); }
  }
  const stale = [...generatedIn(root, '.claude/agents', '.md'), ...generatedIn(root, '.codex/agents', '.toml')].filter((p) => !files.has(p));
  const skillsDir = join(root, '.claude/skills');
  if (existsSync(skillsDir)) for (const name of readdirSync(skillsDir)) if (!links.has(`.claude/skills/${name}`)) stale.push(`.claude/skills/${name}`);
  for (const path of stale) {
    if (check) problems.push(`stale generated file: ${path}`);
    else rmSync(join(root, path), { recursive: true, force: true });
  }
  if (problems.length) {
    console.error(problems.join('\n') + '\nRun `npm run agents:sync`.');
    process.exit(1);
  }
  console.log(`${check ? 'Checked' : 'Synced'} ${files.size} agent adapters and ${links.size} skill links.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run(join(fileURLToPath(import.meta.url), '../../..'), process.argv.includes('--check'));
}
