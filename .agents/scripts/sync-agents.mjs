// Generates runtime adapters from the single source of truth:
//   .agents/roles/<role>.md         -> .claude/agents/<role>.md, .codex/agents/<role>.toml
//   .agents/skills/<name>/**         -> .claude/skills/<name>/** (checked generated copies)
// Checked copies work with Windows checkouts that materialize Git symlinks as text files.
// `--check` verifies all generated content without writing (used in CI).
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync, lstatSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROLE_FIELDS = [
  'name',
  'description',
  'claude_model',
  'claude_tools',
  'effort',
  'max_turns',
  'codex_sandbox',
  'area_rules',
];
const REQUIRED = ['name', 'description', 'claude_model', 'claude_tools', 'effort', 'codex_sandbox'];
const BANNER =
  'GENERATED from .agents/roles/{name}.md by .agents/scripts/sync-agents.mjs. Edit the source, then run `npm run agents:sync`.';

export function parseFrontmatter(text, file = 'input') {
  // Agent sources are edited on Windows too; normalize line endings before parsing and rendering.
  const normalized = text.replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(normalized);
  if (!match) throw new Error(`${file}: missing frontmatter`);
  const meta = {};
  for (const line of match[1].split('\n')) {
    // Nested YAML (indented lines, e.g. `metadata:` maps in upstream skills) is not needed by our tooling.
    if (!line.trim() || /^\s/.test(line)) continue;
    const kv = /^([a-z_-]+):\s*(.*)$/.exec(line);
    if (!kv) throw new Error(`${file}: bad frontmatter line "${line}"`);
    const raw = kv[2].trim();
    // Keep frontmatter valid YAML for Claude Code and Codex: values with ": " or " #" must be quoted.
    if (!raw.startsWith('"') && /: | #/.test(raw))
      throw new Error(`${file}: quote the value of "${kv[1]}" (contains ": " or " #")`);
    meta[kv[1]] = raw.startsWith('"') ? JSON.parse(raw) : raw;
  }
  return { meta, body: match[2].trim() + '\n' };
}

export function validateRole(meta, file) {
  for (const key of Object.keys(meta))
    if (!ROLE_FIELDS.includes(key)) throw new Error(`${file}: unknown field "${key}"`);
  for (const key of REQUIRED) if (!meta[key]) throw new Error(`${file}: missing "${key}"`);
  if (meta.name !== basename(file, '.md')) throw new Error(`${file}: name must match file name`);
}

export function renderClaude(meta, body) {
  const lines = [
    '---',
    `name: ${meta.name}`,
    `description: ${JSON.stringify(meta.description)}`,
    `tools: ${meta.claude_tools}`,
    `model: ${meta.claude_model}`,
    `effort: ${meta.effort}`,
  ];
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
  const skills = new Map();
  for (const file of readdirSync(join(root, '.agents/roles'))
    .filter((f) => f.endsWith('.md'))
    .toSorted()) {
    const { meta, body } = parseFrontmatter(
      readFileSync(join(root, '.agents/roles', file), 'utf8'),
      `.agents/roles/${file}`,
    );
    validateRole(meta, file);
    files.set(`.claude/agents/${meta.name}.md`, renderClaude(meta, body));
    files.set(`.codex/agents/${meta.name}.toml`, renderCodex(meta, body));
  }
  for (const name of readdirSync(join(root, '.agents/skills')).toSorted()) {
    const source = join(root, '.agents/skills', name);
    if (!existsSync(join(source, 'SKILL.md'))) continue;
    const collect = (dir, relative = '') => {
      for (const entry of readdirSync(dir, { withFileTypes: true }).toSorted((a, b) => a.name.localeCompare(b.name))) {
        const abs = join(dir, entry.name);
        const child = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink()) throw new Error(`Skill source may not contain symlinks: ${abs}`);
        if (entry.isDirectory()) collect(abs, child);
        else if (entry.isFile()) skills.set(`.claude/skills/${name}/${child}`, readFileSync(abs));
      }
    };
    collect(source);
  }
  return { files, skills };
}

function generatedIn(root, dir, ext) {
  const abs = join(root, dir);
  return existsSync(abs)
    ? readdirSync(abs)
        .filter((f) => f.endsWith(ext))
        .map((f) => `${dir}/${f}`)
    : [];
}

function skillFilesIn(root) {
  const base = '.claude/skills';
  const files = [];
  const collect = (dir, relative) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const path = `${relative}/${entry.name}`;
      if (entry.isDirectory()) collect(abs, path);
      else files.push(path);
    }
  };
  const abs = join(root, base);
  if (existsSync(abs)) {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const path = `${base}/${entry.name}`;
      const child = join(abs, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) collect(child, path);
      else files.push(path);
    }
  }
  return files;
}

function prepareSkillDirectories(root, skills, check, problems) {
  const names = new Set([...skills.keys()].map((path) => path.split('/')[2]));
  for (const name of names) {
    const abs = join(root, '.claude/skills', name);
    let info;
    try {
      info = lstatSync(abs);
    } catch {
      info = null;
    }
    if (info?.isDirectory() && !info.isSymbolicLink()) continue;
    if (check) problems.push(`skill adapter must be a generated directory: .claude/skills/${name}`);
    else {
      if (info) rmSync(abs, { recursive: true, force: true });
      mkdirSync(abs, { recursive: true });
    }
  }
}

function run(root, check) {
  const { files, skills } = plan(root);
  const problems = [];
  for (const [path, content] of files) {
    const abs = join(root, path);
    const current = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
    if (current === content) continue;
    if (check) problems.push(`out of date: ${path}`);
    else {
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, content);
    }
  }
  prepareSkillDirectories(root, skills, check, problems);
  for (const [path, content] of skills) {
    const abs = join(root, path);
    const dir = join(abs, '..');
    const current = existsSync(abs) ? readFileSync(abs) : null;
    if (current?.equals(content)) continue;
    if (check) problems.push(`${current ? 'out of date' : 'missing'}: ${path}`);
    else {
      mkdirSync(dir, { recursive: true });
      writeFileSync(abs, content);
    }
  }
  const stale = [
    ...generatedIn(root, '.claude/agents', '.md'),
    ...generatedIn(root, '.codex/agents', '.toml'),
    ...skillFilesIn(root),
  ].filter((p) => !files.has(p) && !skills.has(p));
  for (const path of stale) {
    if (check) problems.push(`stale generated file: ${path}`);
    else rmSync(join(root, path), { recursive: true, force: true });
  }
  if (problems.length) {
    console.error(problems.join('\n') + '\nRun `npm run agents:sync`.');
    process.exit(1);
  }
  console.log(`${check ? 'Checked' : 'Synced'} ${files.size} agent adapters and ${skills.size} skill files.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run(join(fileURLToPath(import.meta.url), '../../..'), process.argv.includes('--check'));
}
