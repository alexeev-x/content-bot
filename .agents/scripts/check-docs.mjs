// Deterministic checks for agent instructions and canonical docs (no LLM needed).
// Size budgets keep always-loaded context small; raise one only with a reason in the PR.
// Roles load only when that agent is spawned, so their budget is looser than AGENTS.md.
// Area rules load only when working in that area; they carry the approved stack, hence 5200.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from './sync-agents.mjs';

const BUDGET = { rootAgents: 6800, areaAgents: 5200, role: 3500, skill: 5000, skillDescription: 300 };
const CANONICAL = [
  'AGENTS.md',
  'docs/DECISIONS.md',
  'docs/BACKEND_ARCHITECTURE.md',
  'docs/FRONTEND_ARCHITECTURE.md',
  'docs/API_CONTRACTS.md',
  'docs/AGENT_ORCHESTRATION.md',
  'docs/DESIGN_SYSTEM_NO_FIGMA.md',
];
const AREA_AGENTS = ['apps/backend/AGENTS.md', 'apps/frontend/AGENTS.md', 'apps/contracts/AGENTS.md'];

export function checkRepo(root) {
  const errors = [];
  const read = (p) => readFileSync(join(root, p), 'utf8');
  const size = (p) => Buffer.byteLength(read(p).replace(/\r\n/g, '\n'), 'utf8');
  const budget = (p, max) => {
    if (size(p) > max) errors.push(`${p}: ${size(p)} bytes > budget ${max}`);
  };

  for (const p of [...CANONICAL, ...AREA_AGENTS]) if (!existsSync(join(root, p))) errors.push(`missing: ${p}`);
  if (errors.length) return errors;

  if (!/Figma is not needed at all|Figma не нужна/.test(read('docs/DESIGN_SYSTEM_NO_FIGMA.md')))
    errors.push('docs/DESIGN_SYSTEM_NO_FIGMA.md: owner decision on Figma is missing');
  budget('AGENTS.md', BUDGET.rootAgents);
  AREA_AGENTS.forEach((p) => budget(p, BUDGET.areaAgents));

  const skills = readdirSync(join(root, '.agents/skills')).filter((n) =>
    existsSync(join(root, '.agents/skills', n, 'SKILL.md')),
  );
  for (const name of skills) {
    const p = `.agents/skills/${name}/SKILL.md`;
    // Vendored upstream skills (with UPSTREAM.md) are copied verbatim, so our size budgets don't apply.
    const vendored = existsSync(join(root, '.agents/skills', name, 'UPSTREAM.md'));
    if (!vendored) budget(p, BUDGET.skill);
    const { meta } = parseFrontmatter(read(p), p);
    if (meta.name !== name) errors.push(`${p}: name "${meta.name}" must equal folder "${name}"`);
    for (const [, ref] of read(p).matchAll(/`(references\/[A-Za-z0-9_./-]+)`/g))
      if (!existsSync(join(root, '.agents/skills', name, ref))) errors.push(`${p}: missing ${ref}`);
    if (!meta.description) errors.push(`${p}: description is required (Claude and Codex)`);
    else if (!vendored && meta.description.length > BUDGET.skillDescription)
      errors.push(`${p}: description longer than ${BUDGET.skillDescription} chars`);
  }
  for (const f of readdirSync(join(root, '.agents/roles')).filter((f) => f.endsWith('.md')))
    budget(`.agents/roles/${f}`, BUDGET.role);

  // Every skill and file an instruction points to must exist.
  const instructionFiles = [
    'AGENTS.md',
    ...AREA_AGENTS,
    ...readdirSync(join(root, '.agents/roles')).map((f) => `.agents/roles/${f}`),
    ...skills
      .filter((n) => !existsSync(join(root, '.agents/skills', n, 'UPSTREAM.md')))
      .map((n) => `.agents/skills/${n}/SKILL.md`),
  ];
  for (const p of instructionFiles) {
    const text = read(p);
    // References are written as "skill `x`" or "skills `x`, `y`"; every listed name must exist.
    for (const [list] of text.matchAll(/skills? `[a-z0-9-]+`(?:(?:,| and| or)\s*`[a-z0-9-]+`)*/g))
      for (const [, name] of list.matchAll(/`([a-z0-9-]+)`/g))
        if (!skills.includes(name)) errors.push(`${p}: unknown skill "${name}"`);
    for (const [, ref] of text.matchAll(/`((?:docs|apps)\/[A-Za-z0-9_./-]+\.md)(?:#[^`]*)?`/g))
      if (!existsSync(join(root, ref))) errors.push(`${p}: broken reference ${ref}`);
  }

  // Product code lives only under apps/{frontend,backend,contracts}; guard against old layouts coming back (tree diagrams nest names under apps/, so they are skipped).
  const stale = /\bapps\/(admin|api)\b|packages\/contracts|(?<![\w./-])(frontend|backend|contracts)\/(?!backend\b)/;
  for (const p of [...CANONICAL, ...AREA_AGENTS, 'README.md', ...instructionFiles])
    if (
      read(p)
        .split('\n')
        .some((line) => !/[├└│]/.test(line) && stale.test(line))
    )
      errors.push(`${p}: stale path — use apps/frontend, apps/backend, apps/contracts`);
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = checkRepo(join(fileURLToPath(import.meta.url), '../../..'));
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log('Docs and agent instruction checks passed.');
}
