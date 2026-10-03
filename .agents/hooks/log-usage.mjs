// Stop / SubagentStop hook (Claude Code): records token usage of the session and its subagents
// into .agent-metrics/sessions/<session_id>.json, so model/role/skill changes can be compared on data.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FIELDS = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'];

export function sumTranscript(text) {
  const seen = new Map();
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"')) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const msg = entry.message;
    if (!msg?.usage || !msg.id) continue;
    seen.set(msg.id, { model: msg.model, usage: msg.usage }); // streamed chunks repeat the id; keep the last
  }
  const total = Object.fromEntries(FIELDS.map((f) => [f, 0]));
  const models = {};
  for (const { model, usage } of seen.values()) {
    for (const f of FIELDS) total[f] += usage[f] ?? 0;
    models[model] = (models[model] ?? 0) + 1;
  }
  return { messages: seen.size, models, ...total };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw || '{}');
  if (!input.transcript_path || !existsSync(input.transcript_path)) process.exit(0);
  const main = sumTranscript(readFileSync(input.transcript_path, 'utf8'));
  const subDir = join(input.transcript_path.replace(/\.jsonl$/, ''), 'subagents');
  const subagents = existsSync(subDir)
    ? Object.fromEntries(
        readdirSync(subDir)
          .filter((f) => f.endsWith('.jsonl'))
          .map((f) => [f.replace(/\.jsonl$/, ''), sumTranscript(readFileSync(join(subDir, f), 'utf8'))]),
      )
    : {};
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: input.cwd ?? process.cwd(),
    encoding: 'utf8',
  }).trim();
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
  const dir = join(root, '.agent-metrics', 'sessions');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${input.session_id}.json`),
    JSON.stringify(
      { session_id: input.session_id, branch, updated: new Date().toISOString(), main, subagents },
      null,
      2,
    ),
  );
}
