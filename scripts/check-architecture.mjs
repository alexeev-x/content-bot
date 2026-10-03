import { readFileSync, existsSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const files=['AGENTS.md','docs/AGENT_ORCHESTRATION.md','docs/DESIGN_SYSTEM_NO_FIGMA.md','docs/BACKEND_ARCHITECTURE.md','docs/FRONTEND_ARCHITECTURE.md','docs/API_CONTRACTS.md'];
files.forEach(p=>assert(existsSync(p), 'Missing canonical file: '+p));
assert(readFileSync('docs/DESIGN_SYSTEM_NO_FIGMA.md','utf8').includes('Figma не нужна'),'Figma decision missing');
console.log('Architecture document presence checks passed (not dependency graph analysis).');
